import "server-only";

// 3店舗共通フォーマットのPLスプレッドシート用パーサー。
// ラベル列の位置(インデント段数)や項目名の表記は店舗ごとに微妙に異なることが実データで判明したため、
// 「年月ヘッダーが始まる列より左側ならどこでもラベル列とみなす」+「項目ごとに複数の候補ラベルを試す」設計にする。

const DIRECT_LABEL_CANDIDATES: Record<string, string[]> = {
  revenue: ["売上高合計", "売上高"],
  foodPurchase: ["食材", "食材 仕入高"],
  suppliesPurchase: ["備品", "備品 / 消耗品"],
  inventoryBeginning: ["期首棚卸高"],
  inventoryEnding: ["期末棚卸高"],
  staffLaborBase: ["人件費"],
  partTimeLaborBase: ["AP人件費"],
  rent: ["地主家賃"],
  advertising: ["広告宣伝費", "販売促進費"],
  utilities: ["水道光熱費", "水道光熱費・水道"],
  welfare: ["福利厚生費"],
  telecomSecurityTotal: ["通信警備費", "通信費"],
};

// 一部店舗では「人件費」行自体が社員/APの合算済み1行で、内訳(社員給与・AP給与等)は
// 別行に分かれている(例: 小人)。その場合はこちらの複数ラベルを合算して使い、
// 直接一致するラベルが見つからない場合のみDIRECT_LABEL_CANDIDATESにフォールバックする。
const SUM_LABEL_CANDIDATES: Record<string, string[]> = {
  staffLaborBase: ["社員給与", "社員インセ"],
  partTimeLaborBase: ["AP給与", "AP交通費"],
};

const OTHER_EXPENSE_LABELS = [
  "消耗品",
  "修繕費",
  "その他支払い",
  "環境オプティマル",
  "交通費",
  "全東信支払手数料（カード）",
  "手数料（Square）",
  "RS支払い",
  "ゴミ回収",
];

// 「食べログ」「テーブルチェック」「手数料（TC）」は店舗によって扱いが異なる:
// ノ音・茶ノ音・和ノ音では「広告宣伝費」(または「通信警備費」)の内訳の1行として
// 既にその合計値に含まれている一方、小人には広告宣伝費・通信警備費の行自体が無く、
// これらは独立した経費項目として存在する。
// 親の合計行(parentLabels)がシート内に存在する場合はそちらに含まれているとみなして
// 二重計上を避け、存在しない場合(=独立項目として扱われている店舗)のみその他経費に加算する。
const CONDITIONAL_OTHER_EXPENSE_LABELS: { parentLabels: string[]; subLabels: string[] }[] = [
  { parentLabels: ["広告宣伝費", "販売促進費"], subLabels: ["食べログ", "テーブルチェック"] },
  { parentLabels: ["通信警備費"], subLabels: ["手数料（TC）"] },
];

export type SheetPLValues = {
  revenue: number;
  foodPurchase: number;
  suppliesPurchase: number;
  inventoryBeginning: number;
  inventoryEnding: number;
  staffLaborBase: number;
  partTimeLaborBase: number;
  rent: number;
  advertising: number;
  utilities: number;
  welfare: number;
  telecomSecurityTotal: number;
  otherExpenses: number;
};

function toNumber(cell: unknown): number {
  if (typeof cell === "number") return cell;
  if (typeof cell === "string") {
    const cleaned = cell.replace(/[¥,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** その行で、labelColEnd列より前(0..labelColEnd-1)にある最初の空でない非数値セルをラベルとする */
function rowLabel(row: string[], labelColEnd: number): string | null {
  for (let col = 0; col < labelColEnd; col++) {
    const cell = row[col];
    if (cell !== undefined && cell !== null && String(cell).trim() !== "") {
      const text = String(cell).trim();
      if (!/^-?[\d,¥.]+$/.test(text)) return text;
    }
  }
  return null;
}

/** 年ヘッダー行(整数2000-2100が並ぶ最初の行)から、各年の開始列を特定する */
function findYearColumns(grid: string[][]): { year: number; startCol: number }[] {
  const found: { year: number; startCol: number }[] = [];
  for (const row of grid) {
    for (let col = 0; col < row.length; col++) {
      const cell = row[col];
      const n = typeof cell === "number" ? cell : Number(String(cell ?? "").trim());
      if (Number.isInteger(n) && n >= 2000 && n <= 2100) {
        found.push({ year: n, startCol: col });
      }
    }
    if (found.length > 0) break; // 最初に年が見つかった行を年ヘッダー行とみなす
  }
  return found.sort((a, b) => a.startCol - b.startCol);
}

/** 月ヘッダー行(「4月」等が最も多く並ぶ行)を特定する */
function findMonthRow(grid: string[][]): string[] | null {
  let best: { row: string[]; count: number } | null = null;
  for (const row of grid) {
    const count = row.filter((c) => /^\d{1,2}月$/.test(String(c ?? "").trim())).length;
    if (count >= 6 && (!best || count > best.count)) {
      best = { row, count };
    }
  }
  return best?.row ?? null;
}

function findTargetColumn(
  yearColumns: { year: number; startCol: number }[],
  monthRow: string[],
  year: number,
  month: number
): number | null {
  const yearIndex = yearColumns.findIndex((y) => y.year === year);
  if (yearIndex === -1) return null;
  const rangeStart = yearColumns[yearIndex].startCol;
  const rangeEnd =
    yearIndex + 1 < yearColumns.length ? yearColumns[yearIndex + 1].startCol : Infinity;

  for (let col = rangeStart; col < monthRow.length && col < rangeEnd; col++) {
    if (String(monthRow[col] ?? "").trim() === `${month}月`) return col;
  }
  return null;
}

function findLabelRowValue(
  grid: string[][],
  candidates: string[],
  col: number,
  labelColEnd: number
): number {
  for (const candidate of candidates) {
    for (const row of grid) {
      if (rowLabel(row, labelColEnd) === candidate) return toNumber(row[col]);
    }
  }
  return 0;
}

// revenueは実データ上「売上高」(生入力行)と「売上高合計」(集計行)が同一シート内に
// 両方存在する店舗があるが、その関係性は店舗によって異なることが判明した:
//   - 小人: 「売上高」は値の入っていない見出し行(常に0)、「売上高合計」が実際の値
//   - ノ音: 「売上高」が(客席売上+CAFE&PM仕入れ販売を含む)真の合計、
//           「売上高合計」は客席売上のみのサブトータル(CAFE&PM分が乗っていない月がある)
//   - 和ノ音: 通常は両方同じ値が入るが、月によって「売上高合計」側が一時的に0になり
//             「売上高」側にだけ実績が入っていることがある(2026年8月で確認)
// 単純な優先順位(先勝ち)ではどの店舗でも安全に成立しないため、revenueに限っては
// 候補行のうち値が最大のものを採用する(値が0の見出し行やサブトータルより、実績が
// 入っている行・より包括的な合計行を優先することになり、上記いずれのケースも正しく処理できる)。
const MAX_VALUE_FIELDS = new Set(["revenue"]);

function findLabelRowValueMax(
  grid: string[][],
  candidates: string[],
  col: number,
  labelColEnd: number
): number {
  let found = false;
  let max = 0;
  for (const candidate of candidates) {
    for (const row of grid) {
      if (rowLabel(row, labelColEnd) === candidate) {
        const value = toNumber(row[col]);
        if (!found || value > max) {
          max = value;
          found = true;
        }
        break;
      }
    }
  }
  return found ? max : 0;
}

/** 候補ラベルのいずれかの行がシート内に存在するかどうか(値の有無ではなく行自体の有無) */
function findLabelRowExists(grid: string[][], candidates: string[], labelColEnd: number): boolean {
  for (const candidate of candidates) {
    for (const row of grid) {
      if (rowLabel(row, labelColEnd) === candidate) return true;
    }
  }
  return false;
}

/** 指定ラベルの行が見つかった場合のみ値を返す(未入力=0と「行が存在しない」を区別するため) */
function findLabelRowValueOrNull(
  grid: string[][],
  candidate: string,
  col: number,
  labelColEnd: number
): number | null {
  for (const row of grid) {
    if (rowLabel(row, labelColEnd) === candidate) return toNumber(row[col]);
  }
  return null;
}

function findFieldValue(
  grid: string[][],
  field: string,
  col: number,
  labelColEnd: number
): number {
  const sumLabels = SUM_LABEL_CANDIDATES[field];
  if (sumLabels) {
    let found = false;
    let sum = 0;
    for (const label of sumLabels) {
      const value = findLabelRowValueOrNull(grid, label, col, labelColEnd);
      if (value !== null) {
        found = true;
        sum += value;
      }
    }
    if (found) return sum;
  }
  const candidates = DIRECT_LABEL_CANDIDATES[field] ?? [];
  if (MAX_VALUE_FIELDS.has(field)) {
    return findLabelRowValueMax(grid, candidates, col, labelColEnd);
  }
  return findLabelRowValue(grid, candidates, col, labelColEnd);
}

function parseColumn(grid: string[][], col: number, labelColEnd: number): SheetPLValues {
  const values = {} as SheetPLValues;
  for (const field of Object.keys(DIRECT_LABEL_CANDIDATES)) {
    (values as Record<string, number>)[field] = findFieldValue(grid, field, col, labelColEnd);
  }
  let otherExpenses = OTHER_EXPENSE_LABELS.reduce(
    (sum, label) => sum + findLabelRowValue(grid, [label], col, labelColEnd),
    0
  );
  for (const { parentLabels, subLabels } of CONDITIONAL_OTHER_EXPENSE_LABELS) {
    const parentExists = findLabelRowExists(grid, parentLabels, labelColEnd);
    if (!parentExists) {
      otherExpenses += subLabels.reduce(
        (sum, label) => sum + findLabelRowValue(grid, [label], col, labelColEnd),
        0
      );
    }
  }
  values.otherExpenses = otherExpenses;
  return values;
}

export type SheetParseResult =
  | { ok: true; values: SheetPLValues }
  | { ok: false; error: string };

export function parsePLFromSheetGrid(
  grid: string[][],
  year: number,
  month: number
): SheetParseResult {
  const yearColumns = findYearColumns(grid);
  const monthRow = findMonthRow(grid);
  if (yearColumns.length === 0 || !monthRow) {
    return { ok: false, error: "スプレッドシート内に年・月のヘッダーが見つかりませんでした。" };
  }

  const col = findTargetColumn(yearColumns, monthRow, year, month);
  if (col === null) {
    return {
      ok: false,
      error: `${year}年${month}月の列がスプレッドシート内に見つかりませんでした。`,
    };
  }

  const labelColEnd = Math.min(...yearColumns.map((y) => y.startCol));
  return { ok: true, values: parseColumn(grid, col, labelColEnd) };
}

export type SheetPeriodValues = { year: number; month: number; values: SheetPLValues };

/**
 * シート内の全期間(年月ヘッダーが存在する範囲すべて)を走査し、
 * 何らかの実データ(売上高など主要項目のいずれかが非ゼロ)がある月だけを返す。
 * 未入力(すべて0)の月は対象外とする。
 */
export function parseAllPeriodsFromSheetGrid(grid: string[][]): SheetPeriodValues[] {
  const yearColumns = findYearColumns(grid);
  const monthRow = findMonthRow(grid);
  if (yearColumns.length === 0 || !monthRow) return [];

  const labelColEnd = Math.min(...yearColumns.map((y) => y.startCol));
  const results: SheetPeriodValues[] = [];

  for (let i = 0; i < yearColumns.length; i++) {
    const { year, startCol } = yearColumns[i];
    const endCol = i + 1 < yearColumns.length ? yearColumns[i + 1].startCol : monthRow.length;
    for (let col = startCol; col < endCol && col < monthRow.length; col++) {
      const monthLabel = String(monthRow[col] ?? "").trim();
      const match = monthLabel.match(/^(\d{1,2})月$/);
      if (!match) continue;
      const month = parseInt(match[1], 10);
      if (month < 1 || month > 12) continue;

      const values = parseColumn(grid, col, labelColEnd);
      // 家賃等の固定費は未来の月まで予算値として埋まっていることがあるため、
      // 「売上高が入力されている」ことを実績月の判定基準にする。
      if (values.revenue === 0) continue;

      results.push({ year, month, values });
    }
  }

  return results;
}
