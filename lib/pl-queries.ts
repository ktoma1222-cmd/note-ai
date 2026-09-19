import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computePL,
  aggregatePL,
  compareValues,
  sumMonthlyPLInputs,
  computeBreakEven,
  type MonthlyPLInput,
  type PLComputed,
  type ComparisonResult,
  type BreakEvenResult,
} from "@/lib/pl-calculations";
import { getGroupIncludedStores } from "@/lib/stores";

export function toPLInput(row: {
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
}): MonthlyPLInput {
  return {
    revenue: row.revenue,
    foodPurchase: row.foodPurchase,
    suppliesPurchase: row.suppliesPurchase,
    inventoryBeginning: row.inventoryBeginning,
    inventoryEnding: row.inventoryEnding,
    staffLaborBase: row.staffLaborBase,
    staffLaborTransport: row.staffLaborTransport,
    partTimeLaborBase: row.partTimeLaborBase,
    partTimeLaborTransport: row.partTimeLaborTransport,
    rent: row.rent,
    advertising: row.advertising,
    utilities: row.utilities,
    welfare: row.welfare,
    telecomSecurityTotal: row.telecomSecurityTotal,
    otherExpenses: row.otherExpenses,
  };
}

export async function getMonthlyPLRow(
  storeId: string,
  year: number,
  month: number
) {
  return prisma.monthlyPL.findUnique({
    where: { storeId_year_month: { storeId, year, month } },
    include: {
      telecomSecurityDetails: { include: { telecomSecurityItem: true } },
    },
  });
}

export async function getMonthlyPLInput(
  storeId: string,
  year: number,
  month: number
): Promise<MonthlyPLInput | null> {
  const row = await getMonthlyPLRow(storeId, year, month);
  if (!row) return null;
  return toPLInput(row);
}

/** 指定店舗・指定年の月次PLを1〜12月ぶん取得(存在しない月はnull) */
export async function getYearlyMonthlyInputs(
  storeId: string,
  year: number
): Promise<(MonthlyPLInput | null)[]> {
  const rows = await prisma.monthlyPL.findMany({
    where: { storeId, year },
  });
  const map = new Map(rows.map((r) => [r.month, toPLInput(r)]));
  return Array.from({ length: 12 }, (_, i) => map.get(i + 1) ?? null);
}

export async function getYearlyPLComputed(
  storeId: string,
  year: number
): Promise<PLComputed | null> {
  const inputs = (await getYearlyMonthlyInputs(storeId, year)).filter(
    (v): v is MonthlyPLInput => v !== null
  );
  if (inputs.length === 0) return null;
  return aggregatePL(inputs);
}

/** グループ集計対象店舗の指定年月の生入力値を合算(内訳表示用) */
export async function getGroupMonthlyPLInput(
  year: number,
  month: number
): Promise<MonthlyPLInput | null> {
  const stores = await getGroupIncludedStores();
  const inputs: MonthlyPLInput[] = [];
  for (const store of stores) {
    const input = await getMonthlyPLInput(store.id, year, month);
    if (input) inputs.push(input);
  }
  if (inputs.length === 0) return null;
  return sumMonthlyPLInputs(inputs);
}

/** グループ集計対象店舗の指定年月PLを合算 */
export async function getGroupMonthlyPLComputed(
  year: number,
  month: number
): Promise<PLComputed | null> {
  const input = await getGroupMonthlyPLInput(year, month);
  return input ? computePL(input) : null;
}

export async function getGroupYearlyPLInputs(
  year: number
): Promise<MonthlyPLInput[]> {
  const stores = await getGroupIncludedStores();
  const inputs: MonthlyPLInput[] = [];
  for (const store of stores) {
    const yearlyInputs = (await getYearlyMonthlyInputs(store.id, year)).filter(
      (v): v is MonthlyPLInput => v !== null
    );
    inputs.push(...yearlyInputs);
  }
  return inputs;
}

export async function getGroupYearlyPLComputed(
  year: number
): Promise<PLComputed | null> {
  const inputs = await getGroupYearlyPLInputs(year);
  if (inputs.length === 0) return null;
  return aggregatePL(inputs);
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export type MonthlyComparisons = {
  current: PLComputed | null;
  previousMonth: PLComputed | null;
  previousYearSameMonth: PLComputed | null;
  yearAverage: PLComputed | null; // 当年の月平均(単純平均)
  otherStoresAverage: PLComputed | null;
  groupAverage: PLComputed | null; // グループ内各店舗の平均(店舗数で割った値)
};

function averagePL(list: PLComputed[]): PLComputed | null {
  if (list.length === 0) return null;
  const sums = list.reduce(
    (acc, cur) => ({
      revenue: acc.revenue + cur.revenue,
      costOfSales: acc.costOfSales + cur.costOfSales,
      staffLaborTotal: acc.staffLaborTotal + cur.staffLaborTotal,
      partTimeLaborTotal: acc.partTimeLaborTotal + cur.partTimeLaborTotal,
      laborCostTotal: acc.laborCostTotal + cur.laborCostTotal,
      fixedCostTotal: acc.fixedCostTotal + cur.fixedCostTotal,
      totalExpenses: acc.totalExpenses + cur.totalExpenses,
      operatingProfit: acc.operatingProfit + cur.operatingProfit,
    }),
    {
      revenue: 0,
      costOfSales: 0,
      staffLaborTotal: 0,
      partTimeLaborTotal: 0,
      laborCostTotal: 0,
      fixedCostTotal: 0,
      totalExpenses: 0,
      operatingProfit: 0,
    }
  );
  const n = list.length;
  const revenue = sums.revenue / n;
  const costOfSales = sums.costOfSales / n;
  const laborCostTotal = sums.laborCostTotal / n;
  const operatingProfit = sums.operatingProfit / n;
  return {
    revenue,
    costOfSales,
    staffLaborTotal: sums.staffLaborTotal / n,
    partTimeLaborTotal: sums.partTimeLaborTotal / n,
    laborCostTotal,
    fixedCostTotal: sums.fixedCostTotal / n,
    totalExpenses: sums.totalExpenses / n,
    operatingProfit,
    costRate: revenue ? (costOfSales / revenue) * 100 : null,
    laborCostRate: revenue ? (laborCostTotal / revenue) * 100 : null,
    operatingProfitRate: revenue ? (operatingProfit / revenue) * 100 : null,
    expenseRates: {
      rent: null,
      advertising: null,
      utilities: null,
      welfare: null,
      telecomSecurityTotal: null,
      otherExpenses: null,
    },
  };
}

/** 指定店舗・指定年月について各種比較対象PLをまとめて取得する */
export async function getMonthlyComparisons(
  storeId: string,
  year: number,
  month: number
): Promise<MonthlyComparisons> {
  const currentInput = await getMonthlyPLInput(storeId, year, month);
  const current = currentInput ? computePL(currentInput) : null;

  const pm = prevMonth(year, month);
  const prevInput = await getMonthlyPLInput(storeId, pm.year, pm.month);
  const previousMonth = prevInput ? computePL(prevInput) : null;

  const prevYearInput = await getMonthlyPLInput(storeId, year - 1, month);
  const previousYearSameMonth = prevYearInput ? computePL(prevYearInput) : null;

  const yearlyInputs = (await getYearlyMonthlyInputs(storeId, year)).filter(
    (v): v is MonthlyPLInput => v !== null
  );
  const yearAverage =
    yearlyInputs.length > 0
      ? averagePL(yearlyInputs.map((i) => computePL(i)))
      : null;

  const allStores = await getGroupIncludedStores();
  const otherStoreComputed: PLComputed[] = [];
  const allStoreComputed: PLComputed[] = [];
  for (const store of allStores) {
    const input = await getMonthlyPLInput(store.id, year, month);
    if (!input) continue;
    const computed = computePL(input);
    allStoreComputed.push(computed);
    if (store.id !== storeId) otherStoreComputed.push(computed);
  }
  const otherStoresAverage = averagePL(otherStoreComputed);
  const groupAverage = averagePL(allStoreComputed);

  return {
    current,
    previousMonth,
    previousYearSameMonth,
    yearAverage,
    otherStoresAverage,
    groupAverage,
  };
}

export async function getMonthlyComputedForStoreOrGroup(
  storeParam: string,
  year: number,
  month: number
): Promise<PLComputed | null> {
  if (storeParam === "group") {
    return getGroupMonthlyPLComputed(year, month);
  }
  const input = await getMonthlyPLInput(storeParam, year, month);
  return input ? computePL(input) : null;
}

export async function getYearlyComputedForStoreOrGroup(
  storeParam: string,
  year: number
): Promise<PLComputed | null> {
  if (storeParam === "group") {
    return getGroupYearlyPLComputed(year);
  }
  return getYearlyPLComputed(storeParam, year);
}

/** 指定店舗(またはグループ)の損益分岐点を計算する。monthを省略すると年間ベース。 */
export async function getBreakEvenForStoreOrGroup(
  storeParam: string,
  year: number,
  month?: number
): Promise<BreakEvenResult | null> {
  const computed =
    month !== undefined
      ? await getMonthlyComputedForStoreOrGroup(storeParam, year, month)
      : await getYearlyComputedForStoreOrGroup(storeParam, year);
  return computed ? computeBreakEven(computed) : null;
}

export type TrendPoint = {
  year: number;
  month: number;
  label: string;
  revenue: number | null;
  operatingProfit: number | null;
  costRate: number | null;
  laborCostRate: number | null;
};

/** 指定終了年月からさかのぼって count ヶ月ぶんの推移データを取得する */
export async function getTrendSeries(
  storeParam: string,
  endYear: number,
  endMonth: number,
  count = 12
): Promise<TrendPoint[]> {
  const points: TrendPoint[] = [];
  let y = endYear;
  let m = endMonth;
  const raw: { year: number; month: number; computed: PLComputed | null }[] = [];
  for (let i = 0; i < count; i++) {
    const computed = await getMonthlyComputedForStoreOrGroup(storeParam, y, m);
    raw.push({ year: y, month: m, computed });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  raw.reverse();
  for (const r of raw) {
    points.push({
      year: r.year,
      month: r.month,
      label: `${String(r.year).slice(2)}/${r.month}`,
      revenue: r.computed?.revenue ?? null,
      operatingProfit: r.computed?.operatingProfit ?? null,
      costRate: r.computed?.costRate ?? null,
      laborCostRate: r.computed?.laborCostRate ?? null,
    });
  }
  return points;
}

export type StoreComparisonPoint = {
  storeId: string;
  storeName: string;
  revenue: number;
  operatingProfit: number;
};

/** 指定年月について、グループ集計対象店舗ごとの売上・営業利益を返す(店舗別比較グラフ用) */
export async function getStoreComparisonForPeriod(
  year: number,
  month: number
): Promise<StoreComparisonPoint[]> {
  const stores = await getGroupIncludedStores();
  const points: StoreComparisonPoint[] = [];
  for (const store of stores) {
    const input = await getMonthlyPLInput(store.id, year, month);
    const computed = input ? computePL(input) : null;
    points.push({
      storeId: store.id,
      storeName: store.name,
      revenue: computed?.revenue ?? 0,
      operatingProfit: computed?.operatingProfit ?? 0,
    });
  }
  return points;
}

/** NOTE GROUP自体についての各種比較(他店舗平均・グループ平均は概念上存在しないためnull) */
export async function getGroupMonthlyComparisons(
  year: number,
  month: number
): Promise<MonthlyComparisons> {
  const current = await getGroupMonthlyPLComputed(year, month);
  const pm = prevMonth(year, month);
  const previousMonth = await getGroupMonthlyPLComputed(pm.year, pm.month);
  const previousYearSameMonth = await getGroupMonthlyPLComputed(year - 1, month);

  // 年間平均 = グループ合算PLを月ごとに算出し、その平均を取る
  const monthlyGroupComputed: PLComputed[] = [];
  for (let mi = 1; mi <= 12; mi++) {
    const c = await getGroupMonthlyPLComputed(year, mi);
    if (c) monthlyGroupComputed.push(c);
  }
  const yearAverage = monthlyGroupComputed.length > 0 ? averagePL(monthlyGroupComputed) : null;

  return {
    current,
    previousMonth,
    previousYearSameMonth,
    yearAverage,
    otherStoresAverage: null,
    groupAverage: null,
  };
}

export async function getStoreYearlyComparisonForPeriod(
  year: number
): Promise<StoreComparisonPoint[]> {
  const stores = await getGroupIncludedStores();
  const points: StoreComparisonPoint[] = [];
  for (const store of stores) {
    const computed = await getYearlyPLComputed(store.id, year);
    points.push({
      storeId: store.id,
      storeName: store.name,
      revenue: computed?.revenue ?? 0,
      operatingProfit: computed?.operatingProfit ?? 0,
    });
  }
  return points;
}

export type PLMetricKey =
  | "revenue"
  | "costOfSales"
  | "costRate"
  | "laborCostTotal"
  | "laborCostRate"
  | "operatingProfit"
  | "operatingProfitRate";

export function pickMetric(pl: PLComputed | null, key: PLMetricKey): number | null {
  if (!pl) return null;
  return pl[key];
}

export function compareMetric(
  current: PLComputed | null,
  reference: PLComputed | null,
  key: PLMetricKey
): ComparisonResult {
  return compareValues(pickMetric(current, key), pickMetric(reference, key));
}
