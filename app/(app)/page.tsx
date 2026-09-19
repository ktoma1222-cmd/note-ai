import { resolvePeriodSelection } from "@/lib/period";
import { getActiveStores, getStoreById } from "@/lib/stores";
import {
  getMonthlyComparisons,
  getGroupMonthlyComparisons,
  getYearlyComputedForStoreOrGroup,
  getTrendSeries,
  getStoreComparisonForPeriod,
  getStoreYearlyComparisonForPeriod,
  type MonthlyComparisons,
} from "@/lib/pl-queries";
import { METRICS, buildComparison, buildKpiValue } from "@/lib/kpi";
import { getUnifiedReservationSummary } from "@/lib/unified-reservation-queries";
import { formatCurrency } from "@/lib/format";
import { KpiCard } from "@/components/pl/KpiCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { StoreComparisonChart } from "@/components/charts/StoreComparisonChart";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const { storeParam, year, month } = resolvePeriodSelection(resolvedParams);
  const isYearly = month === null;

  const storeName =
    storeParam === "group"
      ? "NOTE GROUP"
      : (await getStoreById(storeParam))?.name ?? "店舗";

  let comparisons: MonthlyComparisons;
  if (isYearly) {
    const current = await getYearlyComputedForStoreOrGroup(storeParam, year);
    const previousYear = await getYearlyComputedForStoreOrGroup(storeParam, year - 1);
    comparisons = {
      current,
      previousMonth: null,
      previousYearSameMonth: previousYear,
      yearAverage: null,
      otherStoresAverage: null,
      groupAverage: null,
    };
  } else {
    comparisons =
      storeParam === "group"
        ? await getGroupMonthlyComparisons(year, month!)
        : await getMonthlyComparisons(storeParam, year, month!);
  }

  const trendEndMonth = month ?? 12;
  const trend = await getTrendSeries(storeParam, year, trendEndMonth, 12);
  const storeComparison = isYearly
    ? await getStoreYearlyComparisonForPeriod(year)
    : await getStoreComparisonForPeriod(year, month!);

  const stores = await getActiveStores();
  const periodLabel = isYearly ? `${year}年(年間)` : `${year}年${month}月`;

  const reservationSummary = await getUnifiedReservationSummary(storeParam, year, month);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">{storeName}</h1>
        <p className="text-sm text-foreground-muted">{periodLabel}</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            METRICS.revenue,
            METRICS.costOfSales,
            METRICS.costRate,
            METRICS.laborCostTotal,
            METRICS.laborCostRate,
            METRICS.operatingProfit,
            METRICS.operatingProfitRate,
          ] as const
        ).map((metric) => {
          const comps = [
            !isYearly
              ? buildComparison(comparisons, metric, "previousMonth", "前月比")
              : null,
            buildComparison(
              comparisons,
              metric,
              "previousYearSameMonth",
              isYearly ? "前年比" : "前年同月比"
            ),
          ].filter((c): c is NonNullable<typeof c> => c !== null);
          return (
            <KpiCard
              key={metric.key}
              label={metric.label}
              value={buildKpiValue(comparisons, metric)}
              comparisons={comps}
            />
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TrendChart
          title="売上推移"
          data={trend.map((t) => ({ label: t.label, value: t.revenue }))}
          unit="currency"
        />
        <TrendChart
          title="営業利益推移"
          data={trend.map((t) => ({ label: t.label, value: t.operatingProfit }))}
          color="#1f7a4d"
          unit="currency"
        />
        <TrendChart
          title="原価率推移"
          data={trend.map((t) => ({ label: t.label, value: t.costRate }))}
          color="#b3412c"
          unit="percent"
        />
        <TrendChart
          title="人件費率推移"
          data={trend.map((t) => ({ label: t.label, value: t.laborCostRate }))}
          color="#6b6862"
          unit="percent"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StoreComparisonChart
          title="店舗別売上比較"
          data={storeComparison.map((s) => ({ storeName: s.storeName, value: s.revenue }))}
        />
        <StoreComparisonChart
          title="店舗別営業利益比較"
          data={storeComparison.map((s) => ({ storeName: s.storeName, value: s.operatingProfit }))}
          color="#1f7a4d"
        />
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold">予約状況</h2>
          <p className="text-xs text-foreground-muted">
            店舗・年月ごとにTableCheck取込データがあればそちらを優先し、無い場合はNotionのデータを使用しています(二重計上を避けるため)。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label={`予約組数(${periodLabel})`} value={`${reservationSummary.totalGroups}組`} />
          <KpiCard label={`予約人数(${periodLabel})`} value={`${reservationSummary.totalPeople}人`} />
          {!isYearly && (
            <>
              <KpiCard label="残り予約組数(今月)" value={`${reservationSummary.remainingGroups}組`} />
              <KpiCard label="残り予約人数(今月)" value={`${reservationSummary.remainingPeople}人`} />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label={`予想売上(${periodLabel})`} value={formatCurrency(reservationSummary.estimatedRevenue)} />
          {!isYearly && (
            <KpiCard label="残り予想売上(今月)" value={formatCurrency(reservationSummary.remainingEstimatedRevenue)} />
          )}
        </div>
        <p className="text-xs text-foreground-muted">
          予想売上はTableCheck取込予約の「注文合計金額」(コース料金×人数)の合計です。コース事前注文の無い予約は含まれません。
        </p>
      </section>

      {stores.length === 0 && (
        <p className="text-sm text-foreground-muted">
          店舗が登録されていません。店舗管理から店舗を追加してください。
        </p>
      )}
      {comparisons.current === null && (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
          {periodLabel}の{storeName}のPLデータがまだ入力されていません。PL入力画面から登録してください。
        </p>
      )}
    </div>
  );
}
