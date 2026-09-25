import "server-only";
import { prisma } from "@/lib/prisma";
import { getGroupIncludedStores } from "@/lib/stores";
import type { Prisma } from "@prisma/client";

export async function resolveVisitStoreFilter(
  storeParam: string
): Promise<{ storeId?: string; storeIds?: string[] }> {
  if (storeParam === "group") {
    const stores = await getGroupIncludedStores();
    return { storeIds: stores.map((s) => s.id) };
  }
  return { storeId: storeParam };
}

export function buildVisitWhere(
  storeFilter: { storeId?: string; storeIds?: string[] },
  year: number,
  month: number | null
): Prisma.VisitWhereInput {
  const where: Prisma.VisitWhereInput = {
    visitYear: year,
    ...(month ? { visitMonth: month } : {}),
  };
  if (storeFilter.storeId) where.storeId = storeFilter.storeId;
  if (storeFilter.storeIds) where.storeId = { in: storeFilter.storeIds };
  return where;
}

export async function listVisits(where: Prisma.VisitWhereInput, take = 200) {
  return prisma.visit.findMany({
    where,
    include: { customer: true, store: true },
    orderBy: { visitDateTime: "desc" },
    take,
  });
}

export async function countVisits(where: Prisma.VisitWhereInput) {
  return prisma.visit.count({ where });
}

export type BreakdownItem = { label: string; count: number };

function toBreakdown(
  grouped: { count: number; [key: string]: unknown }[],
  key: string
): BreakdownItem[] {
  return grouped
    .map((g) => ({ label: (g[key] as string | null) ?? "不明", count: g.count }))
    .sort((a, b) => b.count - a.count);
}

export async function getPurposeCategoryBreakdown(
  where: Prisma.VisitWhereInput
): Promise<BreakdownItem[]> {
  const grouped = await prisma.visit.groupBy({
    by: ["purposeCategory"],
    where,
    _count: { _all: true },
  });
  return toBreakdown(
    grouped.map((g) => ({ purposeCategory: g.purposeCategory, count: g._count._all })),
    "purposeCategory"
  );
}

export async function getReservationSourceBreakdown(
  where: Prisma.VisitWhereInput
): Promise<BreakdownItem[]> {
  const grouped = await prisma.visit.groupBy({
    by: ["reservationSource"],
    where,
    _count: { _all: true },
  });
  return toBreakdown(
    grouped.map((g) => ({ reservationSource: g.reservationSource, count: g._count._all })),
    "reservationSource"
  );
}

export type ReservationSummary = {
  totalGroups: number;
  totalPeople: number;
  remainingGroups: number;
  remainingPeople: number;
  estimatedRevenue: number; // 予想売上(コース金額の合計)。TableCheck取込データが無い期間は0(Notionは金額を持たないため)
  remainingEstimatedRevenue: number;
};

/**
 * 予約サマリー(合計組数・合計人数・残り組数・残り人数)。
 * 「予約」としてカウントするのはステータス「確認」のみ(未確定のリクエスト・キャンセルは除外)。
 * 「残り」は指定期間のうち現在時刻より後の予約(visitDateTimeがnullの行は集計対象外)。
 * NotionのVisitには金額情報が無いため、estimatedRevenueは常に0(TableCheck取込データのみが持つ値)。
 */
export async function getReservationSummary(
  where: Prisma.VisitWhereInput
): Promise<ReservationSummary> {
  const confirmedWhere: Prisma.VisitWhereInput = { ...where, status: "CONFIRMED" };
  const remainingWhere: Prisma.VisitWhereInput = {
    ...confirmedWhere,
    visitDateTime: { gt: new Date() },
  };

  const [totalAgg, remainingAgg] = await Promise.all([
    prisma.visit.aggregate({
      where: confirmedWhere,
      _count: { _all: true },
      _sum: { partySize: true },
    }),
    prisma.visit.aggregate({
      where: remainingWhere,
      _count: { _all: true },
      _sum: { partySize: true },
    }),
  ]);

  return {
    totalGroups: totalAgg._count._all,
    totalPeople: totalAgg._sum.partySize ?? 0,
    remainingGroups: remainingAgg._count._all,
    remainingPeople: remainingAgg._sum.partySize ?? 0,
    estimatedRevenue: 0,
    remainingEstimatedRevenue: 0,
  };
}

export type ReservationTrendPoint = {
  label: string;
  currentYearGroups: number;
  currentYearPeople: number;
  previousYearGroups: number;
  previousYearPeople: number;
};

/** 指定年の月別予約組数・人数を、前年同月と並べて12ヶ月分返す(ステータス「確認」のみ)。 */
export async function getReservationYoyTrend(
  storeFilter: { storeId?: string; storeIds?: string[] },
  year: number
): Promise<ReservationTrendPoint[]> {
  const baseWhere: Prisma.VisitWhereInput = { status: "CONFIRMED" };
  if (storeFilter.storeId) baseWhere.storeId = storeFilter.storeId;
  if (storeFilter.storeIds) baseWhere.storeId = { in: storeFilter.storeIds };

  const [currentYearGrouped, previousYearGrouped] = await Promise.all([
    prisma.visit.groupBy({
      by: ["visitMonth"],
      where: { ...baseWhere, visitYear: year },
      _count: { _all: true },
      _sum: { partySize: true },
    }),
    prisma.visit.groupBy({
      by: ["visitMonth"],
      where: { ...baseWhere, visitYear: year - 1 },
      _count: { _all: true },
      _sum: { partySize: true },
    }),
  ]);

  const currentMap = new Map(currentYearGrouped.map((g) => [g.visitMonth, g]));
  const previousMap = new Map(previousYearGrouped.map((g) => [g.visitMonth, g]));

  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const cur = currentMap.get(month);
    const prev = previousMap.get(month);
    return {
      label: `${month}月`,
      currentYearGroups: cur?._count._all ?? 0,
      currentYearPeople: cur?._sum.partySize ?? 0,
      previousYearGroups: prev?._count._all ?? 0,
      previousYearPeople: prev?._sum.partySize ?? 0,
    };
  });
}

export async function getNewRepeatBreakdown(
  where: Prisma.VisitWhereInput
): Promise<{ new: number; repeat: number }> {
  const grouped = await prisma.visit.groupBy({
    by: ["isNewVisit"],
    where,
    _count: { _all: true },
  });
  const newCount = grouped.find((g) => g.isNewVisit)?._count._all ?? 0;
  const repeatCount = grouped.find((g) => !g.isNewVisit)?._count._all ?? 0;
  return { new: newCount, repeat: repeatCount };
}
