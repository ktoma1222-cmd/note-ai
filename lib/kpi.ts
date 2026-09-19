import {
  formatCurrency,
  formatPercent,
  formatSignedPercent,
  formatSignedPoint,
  toneForChange,
} from "@/lib/format";
import { compareMetric, type MonthlyComparisons } from "@/lib/pl-queries";
import type { KpiComparison } from "@/components/pl/KpiCard";
import { METRICS, type MetricConfig } from "@/lib/metrics";

export { METRICS, type MetricConfig };

function formatValue(value: number | null, isRate: boolean): string {
  return isRate ? formatPercent(value) : formatCurrency(value);
}

function formatDiff(
  value: number | null,
  isRate: boolean
): string {
  return isRate ? formatSignedPoint(value) : formatSignedPercent(value);
}

export function buildComparison(
  comparisons: MonthlyComparisons,
  metric: MetricConfig,
  referenceKey: keyof MonthlyComparisons,
  label: string
): KpiComparison | null {
  const reference = comparisons[referenceKey];
  if (!reference || !comparisons.current) return null;
  const result = compareMetric(comparisons.current, reference, metric.key);
  const diffForTone = metric.isRate ? result.pointChange : result.percentChange;
  const text = metric.isRate
    ? formatDiff(result.pointChange, true)
    : formatDiff(result.percentChange, false);
  return {
    label,
    text,
    tone: toneForChange(diffForTone, metric.higherIsBetter),
  };
}

export function buildKpiValue(comparisons: MonthlyComparisons, metric: MetricConfig): string {
  const value = comparisons.current ? comparisons.current[metric.key] : null;
  return formatValue(value, metric.isRate);
}
