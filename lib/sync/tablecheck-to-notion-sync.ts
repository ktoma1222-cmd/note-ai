import "server-only";
import { prisma } from "@/lib/prisma";
import {
  createNotionPage,
  updateNotionPage,
  queryAllNotionPages,
} from "@/lib/integrations/notion";
import {
  buildReservationNotionProperties,
  getReservationIdFromPage,
} from "@/lib/integrations/notion-mapping";

export type TableCheckToNotionSyncResult = {
  processed: number;
  created: number;
  updated: number;
  skippedNoStoreMapping: number;
  errors: string[];
  abortedDueToPermission: boolean;
};

/**
 * NotionのIntegrationに書き込み権限(Update content/Insert content)が無い場合、
 * Notion APIは403 restricted_resourceを返す。この種のエラーは1件ずつリトライしても
 * 意味が無い(全件同じ理由で失敗する)ため、検知したら即座にバッチ全体を中断する。
 */
function isNotionPermissionError(message: string): boolean {
  return message.includes("(403)") && message.includes("restricted_resource");
}

/** Reservationの来店日+時刻をNotionの「予約日時」date型に渡すISO文字列へ結合する。 */
function combineDateTimeIso(visitDate: Date, visitTime: string | null): string {
  if (!visitTime) return visitDate.toISOString();
  const match = visitTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return visitDate.toISOString();
  const combined = new Date(visitDate);
  combined.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return combined.toISOString();
}

/**
 * TableCheck由来のReservationのうち未同期(NOT_SYNCED/ERROR)のものを、Notionのお客様管理DBへ
 * 作成/更新する。突合キーは「予約ID」プロパティ(rich_text)の完全一致。既存の読み取り同期
 * (lib/sync/notion-sync.ts)と同じく1件ずつ逐次処理し、エラーは個別catchして継続する。
 */
export async function runTableCheckToNotionSync(): Promise<TableCheckToNotionSyncResult> {
  const result: TableCheckToNotionSyncResult = {
    processed: 0,
    created: 0,
    updated: 0,
    skippedNoStoreMapping: 0,
    errors: [],
    abortedDueToPermission: false,
  };

  const stores = await prisma.store.findMany({ where: { notionLabel: { not: null } } });
  const storeIdToNotionLabel = new Map(stores.map((s) => [s.id, s.notionLabel as string]));

  const reservations = await prisma.reservation.findMany({
    where: {
      notionSyncStatus: { in: ["NOT_SYNCED", "ERROR"] },
      storeId: { in: stores.map((s) => s.id) },
    },
  });

  if (reservations.length === 0) return result;

  const notionPages = await queryAllNotionPages();
  const reservationIdToPageId = new Map<string, string>();
  for (const page of notionPages) {
    const reservationId = getReservationIdFromPage(page);
    if (reservationId) reservationIdToPageId.set(reservationId, page.id);
  }

  for (const reservation of reservations) {
    result.processed++;
    const storeNotionLabel = storeIdToNotionLabel.get(reservation.storeId);
    if (!storeNotionLabel) {
      result.skippedNoStoreMapping++;
      continue;
    }

    try {
      const properties = buildReservationNotionProperties(
        {
          externalReservationId: reservation.externalReservationId,
          customerName: reservation.customerName,
          phone: reservation.phone,
          email: reservation.email,
          visitDateTimeIso: combineDateTimeIso(reservation.visitDate, reservation.visitTime),
          partySize: reservation.partySize,
          status: reservation.status,
          isRepeat: reservation.isRepeat,
          purpose: reservation.purpose,
          country: reservation.country,
          reservationSource: reservation.reservationSource,
        },
        storeNotionLabel
      );

      const existingPageId = reservation.externalReservationId
        ? reservationIdToPageId.get(reservation.externalReservationId)
        : undefined;

      let notionPageId: string;
      if (existingPageId) {
        await updateNotionPage(existingPageId, properties);
        notionPageId = existingPageId;
        result.updated++;
      } else {
        const created = await createNotionPage(properties);
        notionPageId = created.id;
        result.created++;
      }

      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { notionPageId, notionSyncedAt: new Date(), notionSyncStatus: "SYNCED" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (isNotionPermissionError(message)) {
        // 権限不足は個々のレコードの問題ではなく、これ以上続けても全件同じ理由で失敗するだけ。
        // 該当レコードのステータスは変更せず(ERRORにすると誤解を招くため)、即座に中断する。
        result.abortedDueToPermission = true;
        result.errors.push(
          `Notion Integrationに書き込み権限(Update content/Insert content)が無いため中断しました: ${message}`
        );
        break;
      }

      result.errors.push(`${reservation.id} (${reservation.customerName}): ${message}`);
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { notionSyncStatus: "ERROR" },
      });
    }
  }

  await prisma.syncState.upsert({
    where: { id: "tablecheck-to-notion" },
    update: { lastSyncedAt: new Date(), lastResult: JSON.stringify(result) },
    create: {
      id: "tablecheck-to-notion",
      lastSyncedAt: new Date(),
      lastResult: JSON.stringify(result),
    },
  });

  return result;
}
