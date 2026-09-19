import { resolvePeriodSelection } from "@/lib/period";
import {
  resolveReservationStoreFilter,
  buildReservationWhere,
  getReservationCount,
  getReservationStatusCounts,
  getReservationSyncStatusCounts,
  listRecentReservations,
} from "@/lib/reservation-queries";
import { getUnifiedReservationSummary, getUnifiedReservationYoyTrend } from "@/lib/unified-reservation-queries";
import { TableCheckReservationRow } from "@/components/customers/TableCheckReservationRow";
import { KpiCard } from "@/components/pl/KpiCard";
import { YoyTrendChart } from "@/components/charts/YoyTrendChart";
import { formatCurrency } from "@/lib/format";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const { storeParam, year, month } = resolvePeriodSelection(resolvedParams);

  const tcStoreFilter = await resolveReservationStoreFilter(storeParam);
  const tcWhere = buildReservationWhere(tcStoreFilter, year, month);

  const [reservationSummary, reservationTrend, tcCount, tcStatusCounts, tcSyncCounts, tcRecent] =
    await Promise.all([
      getUnifiedReservationSummary(storeParam, year, month),
      getUnifiedReservationYoyTrend(storeParam, year),
      getReservationCount(tcWhere),
      getReservationStatusCounts(tcWhere),
      getReservationSyncStatusCounts(tcWhere),
      listRecentReservations(tcWhere),
    ]);
  const periodLabel = month ? `${year}年${month}月` : `${year}年(年間)`;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">Customers</h1>
        <p className="text-sm text-foreground-muted">
          {periodLabel} ・ {tcCount}件の予約データ(TableCheck取込)
        </p>
      </div>

      <p className="text-xs text-foreground-muted">
        予約データはTableCheck CSV取込を正として使用しています。TableCheckがカバーしていない期間のKPI・グラフのみ、参考情報としてNotionの過去データを使用しています。
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label={`予約組数(${periodLabel})`} value={`${reservationSummary.totalGroups}組`} />
        <KpiCard label={`予約人数(${periodLabel})`} value={`${reservationSummary.totalPeople}人`} />
        {month !== null && (
          <>
            <KpiCard label="残り予約組数(今月)" value={`${reservationSummary.remainingGroups}組`} />
            <KpiCard label="残り予約人数(今月)" value={`${reservationSummary.remainingPeople}人`} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard label={`予想売上(${periodLabel})`} value={formatCurrency(reservationSummary.estimatedRevenue)} />
        {month !== null && (
          <KpiCard label="残り予想売上(今月)" value={formatCurrency(reservationSummary.remainingEstimatedRevenue)} />
        )}
      </div>
      <p className="text-xs text-foreground-muted">
        予想売上はTableCheck取込予約の「注文合計金額」(コース料金×人数)の合計です。コース事前注文の無い予約や、TableCheckデータが無くNotionのみを使用している期間は金額に含まれません。
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <YoyTrendChart
          title={`予約組数の推移(${year}年 vs ${year - 1}年)`}
          data={reservationTrend}
          currentKey="currentYearGroups"
          previousKey="previousYearGroups"
          currentLabel={`${year}年`}
          previousLabel={`${year - 1}年`}
        />
        <YoyTrendChart
          title={`予約人数の推移(${year}年 vs ${year - 1}年)`}
          data={reservationTrend}
          currentKey="currentYearPeople"
          previousKey="previousYearPeople"
          currentLabel={`${year}年`}
          previousLabel={`${year - 1}年`}
          color="#1f7a4d"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="確定" value={`${tcStatusCounts.confirmed}件`} />
        <KpiCard label="キャンセル" value={`${tcStatusCounts.cancelled}件`} />
        <KpiCard label="仮予約" value={`${tcStatusCounts.requested}件`} />
        <KpiCard label="Notion未同期" value={`${tcSyncCounts.notSynced}件`} />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground-muted">予約一覧(TableCheck取込)</p>
        {tcRecent.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
            該当期間の予約データがありません。設定 → TableCheck予約同期からCSVを取り込んでください。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[480px] border-collapse md:min-w-[720px]">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs text-foreground-muted">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">来店日時</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">店舗</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">氏名</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">電話番号</th>
                  <th className="hidden whitespace-nowrap px-3 py-2 font-medium md:table-cell">人数</th>
                  <th className="hidden whitespace-nowrap px-3 py-2 font-medium md:table-cell">予約経路</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">ステータス</th>
                </tr>
              </thead>
              <tbody>
                {tcRecent.map((r) => (
                  <TableCheckReservationRow
                    key={r.id}
                    reservation={{
                      id: r.id,
                      visitDate: r.visitDate.toISOString(),
                      visitTime: r.visitTime,
                      storeName: r.store.name,
                      customerName: r.customerName,
                      phone: r.phone,
                      partySize: r.partySize,
                      status: r.status,
                      reservationSource: r.reservationSource,
                    }}
                  />
                ))}
              </tbody>
            </table>
            {tcCount > tcRecent.length && (
              <p className="border-t border-border px-3 py-2 text-xs text-foreground-muted">
                直近{tcRecent.length}件を表示しています(該当期間全{tcCount}件)。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
