"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("この操作には管理者権限が必要です。");
  }
  return session;
}

export async function createTelecomItemAction(formData: FormData) {
  await requireAdmin();
  const storeId = String(formData.get("storeId") ?? "");
  const trimmed = String(formData.get("name") ?? "").trim();
  if (!trimmed || !storeId) return;
  const maxOrder = await prisma.telecomSecurityItem.aggregate({
    where: { storeId },
    _max: { sortOrder: true },
  });
  await prisma.telecomSecurityItem.create({
    data: { storeId, name: trimmed, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
  });
  revalidatePath("/settings/telecom-items");
  revalidatePath("/pl/input");
}

export async function updateTelecomItemAction(itemId: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.telecomSecurityItem.update({ where: { id: itemId }, data: { name: trimmed } });
  revalidatePath("/settings/telecom-items");
  revalidatePath("/pl/input");
}

export async function toggleTelecomItemActiveAction(itemId: string, isActive: boolean) {
  await requireAdmin();
  await prisma.telecomSecurityItem.update({ where: { id: itemId }, data: { isActive } });
  revalidatePath("/settings/telecom-items");
  revalidatePath("/pl/input");
}

export async function deleteTelecomItemAction(itemId: string) {
  await requireAdmin();
  await prisma.telecomSecurityItem.delete({ where: { id: itemId } });
  revalidatePath("/settings/telecom-items");
  revalidatePath("/pl/input");
}
