import "server-only";
import { prisma } from "@/lib/prisma";
import { queryAllNotionPages } from "@/lib/integrations/notion";
import { normalizeNotionPage } from "@/lib/integrations/notion-mapping";

export type NotionSyncResult = {
  processed: number;
  created: number;
  updated: number;
  skippedStores: Record<string, number>;
  errors: string[];
};

function buildDedupKey(phone: string | null, email: string | null, name: string) {
  const normalizedPhone = phone?.replace(/[^0-9+]/g, "");
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  if (email) return `email:${email.trim().toLowerCase()}`;
  return `name:${name.trim().toLowerCase()}`;
}

export async function runNotionSync(): Promise<NotionSyncResult> {
  // 店舗マッピングの後追い変更で過去にスキップした行が漏れないよう、
  // 差分同期(last_edited_time)ではなく毎回全件を取得して冪等にupsertする。
  const stores = await prisma.store.findMany({ where: { notionLabel: { not: null } } });
  const storeByLabel = new Map(stores.map((s) => [s.notionLabel as string, s]));

  const result: NotionSyncResult = {
    processed: 0,
    created: 0,
    updated: 0,
    skippedStores: {},
    errors: [],
  };

  let pages;
  try {
    pages = await queryAllNotionPages();
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  for (const page of pages) {
    result.processed += 1;
    try {
      const normalized = normalizeNotionPage(page);

      if (!normalized.storeLabel || !storeByLabel.has(normalized.storeLabel)) {
        const label = normalized.storeLabel ?? "(店舗名なし)";
        result.skippedStores[label] = (result.skippedStores[label] ?? 0) + 1;
        continue;
      }
      const store = storeByLabel.get(normalized.storeLabel)!;

      const dedupKey = buildDedupKey(normalized.phone, normalized.email, normalized.name);
      const customer = await prisma.customer.upsert({
        where: { dedupKey },
        update: {
          name: normalized.name,
          phone: normalized.phone ?? undefined,
          email: normalized.email ?? undefined,
        },
        create: {
          dedupKey,
          name: normalized.name,
          phone: normalized.phone,
          email: normalized.email,
        },
      });

      const visitDate = normalized.visitDateTime
        ? new Date(normalized.visitDateTime)
        : new Date();

      const existing = await prisma.visit.findUnique({
        where: { notionPageId: normalized.notionPageId },
        select: { id: true },
      });

      await prisma.visit.upsert({
        where: { notionPageId: normalized.notionPageId },
        update: {
          customerId: customer.id,
          storeId: store.id,
          visitDateTime: visitDate,
          visitYear: visitDate.getFullYear(),
          visitMonth: visitDate.getMonth() + 1,
          partySize: normalized.partySize,
          status: normalized.status,
          isNewVisit: normalized.isNewVisit,
          countryRaw: normalized.countryRaw,
          country: normalized.country,
          region: normalized.region,
          purpose: normalized.purpose,
          purposeCategory: normalized.purposeCategory,
          notes: normalized.notes,
          orderNotes: normalized.orderNotes,
        },
        create: {
          notionPageId: normalized.notionPageId,
          customerId: customer.id,
          storeId: store.id,
          visitDateTime: visitDate,
          visitYear: visitDate.getFullYear(),
          visitMonth: visitDate.getMonth() + 1,
          partySize: normalized.partySize,
          status: normalized.status,
          isNewVisit: normalized.isNewVisit,
          countryRaw: normalized.countryRaw,
          country: normalized.country,
          region: normalized.region,
          purpose: normalized.purpose,
          purposeCategory: normalized.purposeCategory,
          notes: normalized.notes,
          orderNotes: normalized.orderNotes,
        },
      });

      if (existing) result.updated += 1;
      else result.created += 1;
    } catch (err) {
      result.errors.push(
        `${page.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  await prisma.syncState.upsert({
    where: { id: "notion" },
    update: { lastSyncedAt: new Date(), lastResult: JSON.stringify(result) },
    create: {
      id: "notion",
      lastSyncedAt: new Date(),
      lastResult: JSON.stringify(result),
    },
  });

  return result;
}
