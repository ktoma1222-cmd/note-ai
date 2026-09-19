import "server-only";
import { prisma } from "@/lib/prisma";
import { getGroupIncludedStores } from "@/lib/stores";
import type { Prisma } from "@prisma/client";

// TableCheck CSV由来のReservationテーブル向けクエリ群。
// customer-queries.ts(Notion同期のVisitテーブル向け)とは意図的に別ファイルにしている。
// 同名の集計関数(用途・予約経路の内訳等)が存在するが、参照元テーブルが異なり
// 意味が違う(NotionのVisitと統合していない、[[project-tablecheck-csv-import]]参照)ため
// 混同を避けるためにも分離した。

export async function resolveReservationStoreFilter(
  storeParam: string
): Promise<{ storeId?: string; storeIds?: string[] }> {
  if (storeParam === "group") {
    const stores = await getGroupIncludedStores();
    return { storeIds: stores.map((s) => s.id) };
  }
  return { storeId: storeParam };
}

/** 指定年月(月省略時は年間)の日付レンジを返す。Reservationはvisit年月のint列を持たないためDate範囲比較する。 */
function buildDateRange(year: number, month: number | null): { gte: Date; lt: Date } {
  if (month) {
    return { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
  }
  return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
}

export function buildReservationWhere(
  storeFilter: { storeId?: string; storeIds?: string[] },
  year: number,
  month: number | null
): Prisma.ReservationWhereInput {
  const where: Prisma.ReservationWhereInput = { visitDate: buildDateRange(year, month) };
  if (storeFilter.storeId) where.storeId = storeFilter.storeId;
  if (storeFilter.storeIds) where.storeId = { in: storeFilter.storeIds };
  return where;
}

export async function getReservationCount(where: Prisma.ReservationWhereInput): Promise<number> {
  return prisma.reservation.count({ where });
}

export type ReservationStatusCounts = {
  confirmed: number;
  cancelled: number;
  requested: number;
  unknown: number;
};

export async function getReservationStatusCounts(
  where: Prisma.ReservationWhereInput
): Promise<ReservationStatusCounts> {
  const grouped = await prisma.reservation.groupBy({ by: ["status"], where, _count: { _all: true } });
  const find = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return {
    confirmed: find("CONFIRMED"),
    cancelled: find("CANCELLED"),
    requested: find("REQUESTED"),
    unknown: find("UNKNOWN"),
  };
}

export type ReservationSyncStatusCounts = {
  synced: number;
  notSynced: number;
  error: number;
};

export async function getReservationSyncStatusCounts(
  where: Prisma.ReservationWhereInput
): Promise<ReservationSyncStatusCounts> {
  const grouped = await prisma.reservation.groupBy({ by: ["notionSyncStatus"], where, _count: { _all: true } });
  const find = (s: string) => grouped.find((g) => g.notionSyncStatus === s)?._count._all ?? 0;
  return {
    synced: find("SYNCED"),
    notSynced: find("NOT_SYNCED"),
    error: find("ERROR"),
  };
}

export type ReservationBreakdownItem = { label: string; count: number };

function toBreakdown(grouped: { count: number; label: string | null }[]): ReservationBreakdownItem[] {
  return grouped
    .map((g) => ({ label: g.label ?? "不明", count: g.count }))
    .sort((a, b) => b.count - a.count);
}

export async function getReservationPurposeBreakdown(
  where: Prisma.ReservationWhereInput
): Promise<ReservationBreakdownItem[]> {
  const grouped = await prisma.reservation.groupBy({ by: ["purpose"], where, _count: { _all: true } });
  return toBreakdown(grouped.map((g) => ({ label: g.purpose, count: g._count._all })));
}

export async function getReservationChannelBreakdown(
  where: Prisma.ReservationWhereInput
): Promise<ReservationBreakdownItem[]> {
  const grouped = await prisma.reservation.groupBy({ by: ["reservationSource"], where, _count: { _all: true } });
  return toBreakdown(grouped.map((g) => ({ label: g.reservationSource, count: g._count._all })));
}

export async function listRecentReservations(where: Prisma.ReservationWhereInput, take = 50) {
  return prisma.reservation.findMany({
    where,
    include: { store: true },
    orderBy: { visitDate: "desc" },
    take,
  });
}
