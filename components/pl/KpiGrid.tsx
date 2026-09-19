import { METRICS, buildComparison, buildKpiValue } from "@/lib/kpi";
import type { MonthlyComparisons } from "@/lib/pl-queries";
import { KpiCard } from "@/components/pl/KpiCard";

const METRIC_LIST = [
  METRICS.revenue,
  METRICS.costOfSales,
  METRICS.costRate,
  METRICS.laborCostTotal,
  METRICS.laborCostRate,
  METRICS.operatingProfit,
  METRICS.operatingProfitRate,
];

export function KpiGrid({
  comparisons,
  referenceKeys,
}: {
  comparisons: MonthlyComparisons;
  referenceKeys: { key: keyof MonthlyComparisons; label: string }[];
}) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {METRIC_LIST.map((metric) => {
        const comps = referenceKeys
          .map((ref) => buildComparison(comparisons, metric, ref.key, ref.label))
          .filter((c): c is NonNullable<typeof c> => c !== null);
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
  );
}
