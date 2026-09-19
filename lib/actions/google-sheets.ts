"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, hasStoreAccess } from "@/lib/auth";
import { extractSpreadsheetId, extractGid, readSheetGrid } from "@/lib/integrations/google-sheets";
import {
  parsePLFromSheetGrid,
  parseAllPeriodsFromSheetGrid,
  type SheetPLValues,
} from "@/lib/integrations/pl-sheet-mapping";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("この操作には管理者権限が必要です。");
  }
  return session;
}

export async function setStoreGoogleSheetAction(storeId: string, urlOrId: string) {
  await requireAdmin();
  const id = urlOrId.trim() ? extractSpreadsheetId(urlOrId) : null;
  if (urlOrId.trim() && !id) {
    throw new Error("スプレッドシートのURLまたはIDを正しく認識できませんでした。");
  }
  const gid = id ? extractGid(urlOrId) : null;
  await prisma.store.update({
    where: { id: storeId },
    data: { googleSheetId: id, googleSheetGid: gid },
  });
  revalidatePath("/settings/google");
}

export async function disconnectGoogleAction() {
  await requireAdmin();
  await prisma.googleConnection.deleteMany({});
  revalidatePath("/settings/google");
}

export type FetchPLResult =
  | { ok: true; values: SheetPLValues }
  | { ok: false; error: string };

export async function fetchPLFromGoogleSheetAction(
  storeId: string,
  year: number,
  month: number
): Promise<FetchPLResult> {
  const session = await getSession();
  if (!session || session.role === "STAFF") {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }
  if (!(await hasStoreAccess(session, storeId))) {
    return { ok: false, error: "この店舗を操作する権限がありません。" };
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store?.googleSheetId) {
    return { ok: false, error: "この店舗にはスプレッドシートが設定されていません。設定 → Google連携から設定してください。" };
  }

  try {
    const grid = await readSheetGrid(store.googleSheetId, store.googleSheetGid);
    const result = parsePLFromSheetGrid(grid, year, month);
    if (!result.ok) return { ok: false, error: result.error };

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "GOOGLE_SHEET_IMPORT",
        targetType: "Store",
        targetId: storeId,
        detail: JSON.stringify({ year, month }),
      },
    });

    return { ok: true, values: result.values };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type BulkImportResult =
  | {
      ok: true;
      imported: { year: number; month: number }[];
      created: number;
      updated: number;
    }
  | { ok: false; error: string };

/** スプレッドシート内で売上高が入力されている全期間を一括で取り込み、確認なしで保存する */
export async function bulkImportPLFromGoogleSheetAction(storeId: string): Promise<BulkImportResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { ok: false, error: "この操作には管理者権限が必要です。" };
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store?.googleSheetId) {
    return { ok: false, error: "この店舗にはスプレッドシートが設定されていません。" };
  }

  let periods;
  try {
    const grid = await readSheetGrid(store.googleSheetId, store.googleSheetGid);
    periods = parseAllPeriodsFromSheetGrid(grid);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (periods.length === 0) {
    return { ok: false, error: "売上高が入力されている期間が見つかりませんでした。" };
  }

  const firstTelecomItem = await prisma.telecomSecurityItem.findFirst({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  let created = 0;
  let updated = 0;
  const imported: { year: number; month: number }[] = [];

  for (const { year, month, values } of periods) {
    const existing = await prisma.monthlyPL.findUnique({
      where: { storeId_year_month: { storeId, year, month } },
      select: { id: true },
    });

    const monthlyPL = await prisma.monthlyPL.upsert({
      where: { storeId_year_month: { storeId, year, month } },
      update: {
        revenue: values.revenue,
        foodPurchase: values.foodPurchase,
        suppliesPurchase: values.suppliesPurchase,
        inventoryBeginning: values.inventoryBeginning,
        inventoryEnding: values.inventoryEnding,
        staffLaborBase: values.staffLaborBase,
        staffLaborTransport: 0,
        partTimeLaborBase: values.partTimeLaborBase,
        partTimeLaborTransport: 0,
        rent: values.rent,
        advertising: values.advertising,
        utilities: values.utilities,
        welfare: values.welfare,
        otherExpenses: values.otherExpenses,
        telecomSecurityTotal: values.telecomSecurityTotal,
        updatedBy: session.userId,
      },
      create: {
        storeId,
        year,
        month,
        revenue: values.revenue,
        foodPurchase: values.foodPurchase,
        suppliesPurchase: values.suppliesPurchase,
        inventoryBeginning: values.inventoryBeginning,
        inventoryEnding: values.inventoryEnding,
        staffLaborBase: values.staffLaborBase,
        staffLaborTransport: 0,
        partTimeLaborBase: values.partTimeLaborBase,
        partTimeLaborTransport: 0,
        rent: values.rent,
        advertising: values.advertising,
        utilities: values.utilities,
        welfare: values.welfare,
        otherExpenses: values.otherExpenses,
        telecomSecurityTotal: values.telecomSecurityTotal,
        updatedBy: session.userId,
      },
    });

    if (firstTelecomItem) {
      await prisma.telecomSecurityDetail.upsert({
        where: {
          monthlyPLId_telecomSecurityItemId: {
            monthlyPLId: monthlyPL.id,
            telecomSecurityItemId: firstTelecomItem.id,
          },
        },
        update: { amount: values.telecomSecurityTotal },
        create: {
          monthlyPLId: monthlyPL.id,
          telecomSecurityItemId: firstTelecomItem.id,
          amount: values.telecomSecurityTotal,
        },
      });
    }

    if (existing) updated += 1;
    else created += 1;
    imported.push({ year, month });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "GOOGLE_SHEET_BULK_IMPORT",
      targetType: "Store",
      targetId: storeId,
      detail: JSON.stringify({ count: imported.length, created, updated }),
    },
  });

  revalidatePath("/");
  revalidatePath("/pl/group");
  revalidatePath(`/pl/${storeId}`);
  revalidatePath("/pl/input");

  return { ok: true, imported, created, updated };
}
