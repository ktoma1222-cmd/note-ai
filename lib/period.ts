// URL検索パラメータから店舗・期間の選択状態を解決する共通ユーティリティ。
// store: 店舗ID または "group" (NOTE GROUP)
// year: 数値年 (未指定時は当年)
// month: 1-12 (未指定時は年次表示)

export type PeriodSelection = {
  storeParam: string; // "group" | storeId
  year: number;
  month: number | null; // null = 年次
};

export function resolvePeriodSelection(
  searchParams: Record<string, string | string[] | undefined>
): PeriodSelection {
  const now = new Date();
  const storeParam = firstValue(searchParams.store) ?? "group";
  const yearRaw = firstValue(searchParams.year);
  const monthRaw = firstValue(searchParams.month);

  const year = yearRaw ? parseInt(yearRaw, 10) : now.getFullYear();
  const month =
    monthRaw === undefined || monthRaw === "" || monthRaw === "ALL"
      ? monthRaw === "ALL"
        ? null
        : now.getMonth() + 1
      : parseInt(monthRaw, 10);

  return {
    storeParam,
    year: Number.isFinite(year) ? year : now.getFullYear(),
    month: month !== null && Number.isFinite(month) ? month : month === null ? null : now.getMonth() + 1,
  };
}

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
