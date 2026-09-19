"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { runNotionSync, type NotionSyncResult } from "@/lib/sync/notion-sync";

export type SyncActionResult =
  | { ok: true; result: NotionSyncResult }
  | { ok: false; error: string };

export async function syncNotionAction(): Promise<SyncActionResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { ok: false, error: "この操作には管理者権限が必要です。" };
  }

  const result = await runNotionSync();

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "NOTION_SYNC",
      targetType: "SyncState",
      targetId: "notion",
      detail: JSON.stringify(result),
    },
  });

  revalidatePath("/settings/notion");
  revalidatePath("/customers");
  revalidatePath("/analytics");

  return { ok: true, result };
}
