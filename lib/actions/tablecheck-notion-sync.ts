"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { runTableCheckToNotionSync, type TableCheckToNotionSyncResult } from "@/lib/sync/tablecheck-to-notion-sync";

export type TableCheckNotionSyncActionResult =
  | { ok: true; result: TableCheckToNotionSyncResult }
  | { ok: false; error: string };

export async function syncTableCheckToNotionAction(): Promise<TableCheckNotionSyncActionResult> {
  const session = await getSession();
  if (!session || session.role === "STAFF") {
    return { ok: false, error: "この操作には管理者またはマネージャー権限が必要です。" };
  }

  try {
    const result = await runTableCheckToNotionSync();

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "TABLECHECK_NOTION_SYNC",
        targetType: "Reservation",
        detail: JSON.stringify(result),
      },
    });

    revalidatePath("/settings/tablecheck");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
