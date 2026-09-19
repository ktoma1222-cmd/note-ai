// PL計算ロジックの一元化モジュール。
// API・バッチ・将来のAI/高速検索は必ずこのモジュール経由で計算済み値を取得し、
// フロントエンドや各呼び出し箇所で独自に再計算しないこと。

export type MonthlyPLInput = {
  revenue: number;
  foodPurchase: number;
  suppliesPurchase: number;
  inventoryBeginning: number;
  inventoryEnding: number;
  staffLaborBase: number;
  staffLaborTransport: number;
  partTimeLaborBase: number;
  partTimeLaborTransport: number;
  rent: number;
  advertising: number;
  utilities: number;
  welfare: number;
  telecomSecurityTotal: number;
  otherExpenses: number;
};

export type PLComputed = {
  revenue: number;

  costOfSales: number;
  staffLaborTotal: number;
  partTimeLaborTotal: number;
  laborCostTotal: number;
  fixedCostTotal: number;
  totalExpenses: number;
  operatingProfit: number;

  costRate: number | null;
  laborCostRate: number | null;
  operatingProfitRate: number | null;

  expenseRates: {
    rent: number | null;
    advertising: number | null;
    utilities: number | null;
    welfare: number | null;
    telecomSecurityTotal: number | null;
    otherExpenses: number | null;
  };
};

function safeRate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

/**
 * 正式版原価計算: 月初棚卸 + 当月仕入(食材+備品) - 月末棚卸
 */
export function computeCostOfSales(input: MonthlyPLInput): number {
  return (
    input.inventoryBeginning +
    input.foodPurchase +
    input.suppliesPurchase -
    input.inventoryEnding
  );
}

export function computePL(input: MonthlyPLInput): PLComputed {
  const costOfSales = computeCostOfSales(input);
  const staffLaborTotal = input.staffLaborBase + input.staffLaborTransport;
  const partTimeLaborTotal =
    input.partTimeLaborBase + input.partTimeLaborTransport;
  const laborCostTotal = staffLaborTotal + partTimeLaborTotal;
  const fixedCostTotal =
    input.rent +
    input.advertising +
    input.utilities +
    input.welfare +
    input.telecomSecurityTotal +
    input.otherExpenses;
  const totalExpenses = costOfSales + laborCostTotal + fixedCostTotal;
  const operatingProfit =
    input.revenue - costOfSales - laborCostTotal - fixedCostTotal;

  return {
    revenue: input.revenue,
    costOfSales,
    staffLaborTotal,
    partTimeLaborTotal,
    laborCostTotal,
    fixedCostTotal,
    totalExpenses,
    operatingProfit,
    costRate: safeRate(costOfSales, input.revenue),
    laborCostRate: safeRate(laborCostTotal, input.revenue),
    operatingProfitRate: safeRate(operatingProfit, input.revenue),
    expenseRates: {
      rent: safeRate(input.rent, input.revenue),
      advertising: safeRate(input.advertising, input.revenue),
      utilities: safeRate(input.utilities, input.revenue),
      welfare: safeRate(input.welfare, input.revenue),
      telecomSecurityTotal: safeRate(
        input.telecomSecurityTotal,
        input.revenue
      ),
      otherExpenses: safeRate(input.otherExpenses, input.revenue),
    },
  };
}

const ZERO_INPUT: MonthlyPLInput = {
  revenue: 0,
  foodPurchase: 0,
  suppliesPurchase: 0,
  inventoryBeginning: 0,
  inventoryEnding: 0,
  staffLaborBase: 0,
  staffLaborTransport: 0,
  partTimeLaborBase: 0,
  partTimeLaborTransport: 0,
  rent: 0,
  advertising: 0,
  utilities: 0,
  welfare: 0,
  telecomSecurityTotal: 0,
  otherExpenses: 0,
};

/** 複数月の入力を単純合算してから computePL する(年次PL・グループPL共通) */
export function sumMonthlyPLInputs(inputs: MonthlyPLInput[]): MonthlyPLInput {
  return inputs.reduce((acc, cur) => {
    const merged: MonthlyPLInput = { ...acc };
    (Object.keys(ZERO_INPUT) as (keyof MonthlyPLInput)[]).forEach((key) => {
      merged[key] = acc[key] + cur[key];
    });
    return merged;
  }, ZERO_INPUT);
}

export function aggregatePL(inputs: MonthlyPLInput[]): PLComputed {
  return computePL(sumMonthlyPLInputs(inputs));
}

export type BreakEvenResult = {
  variableCost: number;
  fixedCost: number;
  variableCostRate: number | null; // %
  breakEvenRevenue: number | null; // 損益分岐点売上高。変動費率が100%以上で計算不能な場合はnull
  actualRevenue: number;
  marginOfSafety: number | null; // 安全余裕率(実績売上高が損益分岐点をどれだけ上回っているか)%
};

/**
 * 損益分岐点売上高 = 固定費 ÷ (1 − 変動費率)
 * 人件費のうち社員人件費(staffLaborTotal)は固定費、アルバイト人件費(partTimeLaborTotal)は
 * 売上に応じてシフト量を調整できる変動費として扱う(飲食店経営で一般的な区分、ユーザー確認済み)。
 * 売上原価(costOfSales)は当然変動費。
 */
export function computeBreakEven(pl: PLComputed): BreakEvenResult {
  const variableCost = pl.costOfSales + pl.partTimeLaborTotal;
  const fixedCost = pl.staffLaborTotal + pl.fixedCostTotal;
  const variableCostRate = safeRate(variableCost, pl.revenue);

  let breakEvenRevenue: number | null = null;
  if (variableCostRate !== null && variableCostRate < 100) {
    breakEvenRevenue = fixedCost / (1 - variableCostRate / 100);
  }

  const marginOfSafety =
    breakEvenRevenue !== null && pl.revenue
      ? ((pl.revenue - breakEvenRevenue) / pl.revenue) * 100
      : null;

  return {
    variableCost,
    fixedCost,
    variableCostRate,
    breakEvenRevenue,
    actualRevenue: pl.revenue,
    marginOfSafety,
  };
}

export type ComparisonResult = {
  currentValue: number | null;
  previousValue: number | null;
  diff: number | null; // currentValue - previousValue
  percentChange: number | null; // (diff / |previousValue|) * 100 、金額指標向け
  pointChange: number | null; // currentValue - previousValue 、率(%)指標向けにポイント差として使う
};

export function compareValues(
  currentValue: number | null,
  previousValue: number | null
): ComparisonResult {
  if (currentValue === null || previousValue === null) {
    return {
      currentValue,
      previousValue,
      diff: null,
      percentChange: null,
      pointChange: null,
    };
  }
  const diff = currentValue - previousValue;
  const percentChange = previousValue !== 0 ? (diff / Math.abs(previousValue)) * 100 : null;
  return {
    currentValue,
    previousValue,
    diff,
    percentChange,
    pointChange: diff,
  };
}
