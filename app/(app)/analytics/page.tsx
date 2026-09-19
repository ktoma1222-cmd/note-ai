import { resolvePeriodSelection } from "@/lib/period";
import { resolveVisitStoreFilter, buildVisitWhere, countVisits, getRegionBreakdown } from "@/lib/customer-queries";
import {
  getUnifiedPurposeBreakdown,
  getUnifiedChannelBreakdown,
  getUnifiedNewRepeatBreakdown,
} from "@/lib/unified-reservation-queries";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarBreakdownChart } from "@/components/charts/BarBreakdownChart";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const { storeParam, year, month } = resolvePeriodSelection(resolvedParams);
  const storeFilter = await resolveVisitStoreFilter(storeParam);
  const where = buildVisitWhere(storeFilter, year, month);
  const periodLabel = month ? `${year}年${month}月` : `${year}年(年間)`;

  const [total, region, purpose, channel, newRepeat] = await Promise.all([
    countVisits(where),
    getRegionBreakdown(where),
    getUnifiedPurposeBreakdown(storeParam, year, month),
    getUnifiedChannelBreakdown(storeParam, year, month),
    getUnifiedNewRepeatBreakdown(storeParam, year, month),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-foreground-muted">{periodLabel} ・ 来店 {total}件</p>
      </div>

      <p className="text-xs text-foreground-muted">
        利用用途・予約経路・新規/リピーターは、店舗・年月ごとにTableCheck取込データがあればそちらを優先し、無い場合はNotionのデータを使用しています(二重計上を避けるため)。
        国籍/地域構成のみ、TableCheck側の国籍データが自由記述で粒度が異なるためNotionのデータのみを使用しています。
      </p>

      {total === 0 && purpose.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
          該当期間のデータがありません。設定 → Notion連携/TableCheck予約同期から取り込んでください。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DonutChart title="国籍/地域構成(Notion)" data={region} />
          <DonutChart title="新規 / リピーター" data={newRepeat} />
          <BarBreakdownChart title="利用用途" data={purpose} />
          <BarBreakdownChart title="予約経路" data={channel} color="#1f7a4d" />
        </div>
      )}
    </div>
  );
}
