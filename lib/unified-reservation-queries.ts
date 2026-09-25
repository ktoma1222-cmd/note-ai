import "server-only";
import { prisma } from "@/lib/prisma";
import { getGroupIncludedStores } from "@/lib/stores";
import { buildVisitWhere, getReservationSummary, type ReservationSummary } from "@/lib/customer-queries";
import type { ReservationTrendPoint, BreakdownItem } from "@/lib/customer-queries";
import { regionForCountry } from "@/lib/integrations/tablecheck-csv";

// Customers画面上部の「予約組数/人数」KPIカード・前年比較グラフを、Notion(Visit)だけでなく
// TableCheck CSV取込(Reservation)のデータも反映させるための統合クエリ。
// NotionとTableCheckの個々の予約を確実に同一と判定できるキーが無い([[project-tablecheck-csv-import]]参照)ため、
// 行単位でのマージはせず「店舗×年月」単位で、その組み合わせにTableCheckデータが1件でもあれば
// TableCheckを優先し、無ければNotion(Visit)を使う、という粒度でユーザーの依頼(「被るようならCSVのみ」)に対応する。

async function resolveStoreIdsInScope(storeParam: string): Promise<string[]> {
  if (storeParam === "group") {
    const stores = await getGroupIncludedStores();
    return stores.map((s) => s.id);
  }
  return [storeParam];
}

function buildDateRange(year: number, month: number | null): { gte: Date; lt: Date } {
  if (month) return { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
  return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
}

export async function getUnifiedReservationSummary(
  storeParam: string,
  year: number,
  month: number | null
): Promise<ReservationSummary> {
  const storeIds = await resolveStoreIdsInScope(storeParam);
  let totalGroups = 0;
  let totalPeople = 0;
  let remainingGroups = 0;
  let remainingPeople = 0;
  let estimatedRevenue = 0;
  let remainingEstimatedRevenue = 0;

  for (const storeId of storeIds) {
    const dateRange = buildDateRange(year, month);
    const hasReservationData = (await prisma.reservation.count({ where: { storeId, visitDate: dateRange } })) > 0;

    if (hasReservationData) {
      const confirmedWhere = { storeId, visitDate: dateRange, status: "CONFIRMED" as const };
      const now = new Date();
      const remainingGte = dateRange.gte > now ? dateRange.gte : now;
      const remainingWhere = { ...confirmedWhere, visitDate: { gte: remainingGte, lt: dateRange.lt } };

      const [totalAgg, remainingAgg] = await Promise.all([
        prisma.reservation.aggregate({
          where: confirmedWhere,
          _count: { _all: true },
          _sum: { partySize: true, estimatedAmount: true },
        }),
        prisma.reservation.aggregate({
          where: remainingWhere,
          _count: { _all: true },
          _sum: { partySize: true, estimatedAmount: true },
        }),
      ]);
      totalGroups += totalAgg._count._all;
      totalPeople += totalAgg._sum.partySize ?? 0;
      remainingGroups += remainingAgg._count._all;
      remainingPeople += remainingAgg._sum.partySize ?? 0;
      estimatedRevenue += totalAgg._sum.estimatedAmount ?? 0;
      remainingEstimatedRevenue += remainingAgg._sum.estimatedAmount ?? 0;
    } else {
      const visitWhere = buildVisitWhere({ storeId }, year, month);
      const summary = await getReservationSummary(visitWhere);
      totalGroups += summary.totalGroups;
      totalPeople += summary.totalPeople;
      remainingGroups += summary.remainingGroups;
      remainingPeople += summary.remainingPeople;
      estimatedRevenue += summary.estimatedRevenue;
      remainingEstimatedRevenue += summary.remainingEstimatedRevenue;
    }
  }

  return { totalGroups, totalPeople, remainingGroups, remainingPeople, estimatedRevenue, remainingEstimatedRevenue };
}

export async function getUnifiedReservationYoyTrend(
  storeParam: string,
  year: number
): Promise<ReservationTrendPoint[]> {
  const storeIds = await resolveStoreIdsInScope(storeParam);
  const points: ReservationTrendPoint[] = Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1}月`,
    currentYearGroups: 0,
    currentYearPeople: 0,
    previousYearGroups: 0,
    previousYearPeople: 0,
  }));

  for (const storeId of storeIds) {
    const visitGrouped = await prisma.visit.groupBy({
      by: ["visitYear", "visitMonth"],
      where: { storeId, status: "CONFIRMED", visitYear: { in: [year, year - 1] } },
      _count: { _all: true },
      _sum: { partySize: true },
    });
    const visitMap = new Map(visitGrouped.map((g) => [`${g.visitYear}-${g.visitMonth}`, g]));

    const reservationRows = await prisma.reservation.findMany({
      where: { storeId, visitDate: { gte: new Date(year - 1, 0, 1), lt: new Date(year + 1, 0, 1) } },
      select: { visitDate: true, partySize: true, status: true },
    });
    const reservationPresence = new Set<string>();
    const reservationAgg = new Map<string, { count: number; people: number }>();
    for (const r of reservationRows) {
      const key = `${r.visitDate.getFullYear()}-${r.visitDate.getMonth() + 1}`;
      reservationPresence.add(key);
      if (r.status === "CONFIRMED") {
        const agg = reservationAgg.get(key) ?? { count: 0, people: 0 };
        agg.count += 1;
        agg.people += r.partySize ?? 0;
        reservationAgg.set(key, agg);
      }
    }

    for (let m = 1; m <= 12; m++) {
      for (const [targetYear, isCurrent] of [
        [year, true],
        [year - 1, false],
      ] as const) {
        const key = `${targetYear}-${m}`;
        let groups: number;
        let people: number;
        if (reservationPresence.has(key)) {
          const agg = reservationAgg.get(key);
          groups = agg?.count ?? 0;
          people = agg?.people ?? 0;
        } else {
          const v = visitMap.get(key);
          groups = v?._count._all ?? 0;
          people = v?._sum.partySize ?? 0;
        }
        const point = points[m - 1];
        if (isCurrent) {
          point.currentYearGroups += groups;
          point.currentYearPeople += people;
        } else {
          point.previousYearGroups += groups;
          point.previousYearPeople += people;
        }
      }
    }
  }

  return points;
}

// --- Analyticsページ向け: 国籍/地域・用途/予約経路/新規リピーターの内訳を「店舗×年月」単位で統合する ---
// 国籍/地域は元々、TableCheck側のcountryが予約メモからの正規表現抽出による表記ゆれの多い
// 自由記述データだったため統合対象外(Notionのformula分類のみ使用)としていたが、
// 2026-09-23にcountryの表記揺れ正規化(normalizeCountry)を行ったため、2026-09-25に統合を再開した。
// countryをregionForCountry()で「日本/アジア/オセアニア/ヨーロッパ/中南米/中東/北米/その他」の
// Notion側と同じ8分類にまとめてから他の指標と同じ優先ルールで統合する。

function toBreakdownItems(grouped: { count: number; label: string | null }[]): BreakdownItem[] {
  return grouped
    .map((g) => ({ label: g.label ?? "不明", count: g.count }))
    .sort((a, b) => b.count - a.count);
}

function mergeBreakdowns(lists: BreakdownItem[][]): BreakdownItem[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const item of list) {
      totals.set(item.label, (totals.get(item.label) ?? 0) + item.count);
    }
  }
  return Array.from(totals.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function hasReservationDataForStore(storeId: string, year: number, month: number | null): Promise<boolean> {
  const count = await prisma.reservation.count({ where: { storeId, visitDate: buildDateRange(year, month) } });
  return count > 0;
}

async function getVisitRegionBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const where = buildVisitWhere({ storeId }, year, month);
  const grouped = await prisma.visit.groupBy({ by: ["region"], where, _count: { _all: true } });
  return toBreakdownItems(grouped.map((g) => ({ label: g.region, count: g._count._all })));
}

async function getReservationRegionBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const grouped = await prisma.reservation.groupBy({
    by: ["country"],
    where: { storeId, visitDate: buildDateRange(year, month) },
    _count: { _all: true },
  });
  const regionCounts = new Map<string, number>();
  for (const g of grouped) {
    const region = regionForCountry(g.country);
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + g._count._all);
  }
  return Array.from(regionCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function getVisitPurposeBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const where = buildVisitWhere({ storeId }, year, month);
  const grouped = await prisma.visit.groupBy({ by: ["purpose"], where, _count: { _all: true } });
  return toBreakdownItems(grouped.map((g) => ({ label: g.purpose, count: g._count._all })));
}

async function getReservationPurposeBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const grouped = await prisma.reservation.groupBy({
    by: ["purpose"],
    where: { storeId, visitDate: buildDateRange(year, month) },
    _count: { _all: true },
  });
  return toBreakdownItems(grouped.map((g) => ({ label: g.purpose, count: g._count._all })));
}

async function getVisitChannelBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const where = buildVisitWhere({ storeId }, year, month);
  const grouped = await prisma.visit.groupBy({ by: ["reservationSource"], where, _count: { _all: true } });
  return toBreakdownItems(grouped.map((g) => ({ label: g.reservationSource, count: g._count._all })));
}

async function getReservationChannelBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const grouped = await prisma.reservation.groupBy({
    by: ["reservationSource"],
    where: { storeId, visitDate: buildDateRange(year, month) },
    _count: { _all: true },
  });
  return toBreakdownItems(grouped.map((g) => ({ label: g.reservationSource, count: g._count._all })));
}

async function getVisitNewRepeatBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const where = buildVisitWhere({ storeId }, year, month);
  const grouped = await prisma.visit.groupBy({ by: ["isNewVisit"], where, _count: { _all: true } });
  return toBreakdownItems(
    grouped.map((g) => ({ label: g.isNewVisit ? "新規" : "リピーター", count: g._count._all }))
  );
}

async function getReservationNewRepeatBreakdownForStore(
  storeId: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const grouped = await prisma.reservation.groupBy({
    by: ["isRepeat"],
    where: { storeId, visitDate: buildDateRange(year, month) },
    _count: { _all: true },
  });
  return toBreakdownItems(
    grouped.map((g) => ({
      label: g.isRepeat === null ? "不明" : g.isRepeat ? "リピーター" : "新規",
      count: g._count._all,
    }))
  );
}

async function getUnifiedBreakdown(
  storeParam: string,
  year: number,
  month: number | null,
  visitFn: (storeId: string, year: number, month: number | null) => Promise<BreakdownItem[]>,
  reservationFn: (storeId: string, year: number, month: number | null) => Promise<BreakdownItem[]>
): Promise<BreakdownItem[]> {
  const storeIds = await resolveStoreIdsInScope(storeParam);
  const perStore = await Promise.all(
    storeIds.map(async (storeId) => {
      const useReservation = await hasReservationDataForStore(storeId, year, month);
      return useReservation ? reservationFn(storeId, year, month) : visitFn(storeId, year, month);
    })
  );
  return mergeBreakdowns(perStore);
}

export async function getUnifiedRegionBreakdown(
  storeParam: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  return getUnifiedBreakdown(
    storeParam,
    year,
    month,
    getVisitRegionBreakdownForStore,
    getReservationRegionBreakdownForStore
  );
}

export async function getUnifiedPurposeBreakdown(
  storeParam: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  return getUnifiedBreakdown(
    storeParam,
    year,
    month,
    getVisitPurposeBreakdownForStore,
    getReservationPurposeBreakdownForStore
  );
}

// TableCheck側の予約経路は自由記述(お客様自身の回答)のため、正規化しきれない一度きりの
// 表現がロングテールで大量に残る。グラフが読めなくなるため上位件数のみ表示し、残りは
// 「その他」に集約する(2026-09-25、ユーザー依頼)。
const CHANNEL_BREAKDOWN_TOP_N = 10;

function capBreakdown(items: BreakdownItem[], topN: number): BreakdownItem[] {
  if (items.length <= topN) return items;
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, topN);
  const restCount = sorted.slice(topN).reduce((sum, item) => sum + item.count, 0);
  const existingOther = top.find((item) => item.label === "その他");
  if (existingOther) {
    existingOther.count += restCount;
    return top.sort((a, b) => b.count - a.count);
  }
  return [...top, { label: "その他", count: restCount }].sort((a, b) => b.count - a.count);
}

export async function getUnifiedChannelBreakdown(
  storeParam: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  const breakdown = await getUnifiedBreakdown(
    storeParam,
    year,
    month,
    getVisitChannelBreakdownForStore,
    getReservationChannelBreakdownForStore
  );
  return capBreakdown(breakdown, CHANNEL_BREAKDOWN_TOP_N);
}

export async function getUnifiedNewRepeatBreakdown(
  storeParam: string,
  year: number,
  month: number | null
): Promise<BreakdownItem[]> {
  return getUnifiedBreakdown(
    storeParam,
    year,
    month,
    getVisitNewRepeatBreakdownForStore,
    getReservationNewRepeatBreakdownForStore
  );
}
