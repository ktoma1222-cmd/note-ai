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

const DEFAULT_TELECOM_ITEMS = [
  "USEN",
  "スマレジ",
  "Wi-Fi",
  "FOOD系サービス",
  "Take系サービス",
  "TableCheck",
  "その他",
];

export async function createStoreAction(formData: FormData) {
  const session = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const maxOrder = await prisma.store.aggregate({ _max: { sortOrder: true } });
  const store = await prisma.store.create({
    data: {
      name,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      isActive: true,
      includeInGroup: true,
    },
  });

  await prisma.telecomSecurityItem.createMany({
    data: DEFAULT_TELECOM_ITEMS.map((itemName, i) => ({
      storeId: store.id,
      name: itemName,
      sortOrder: i,
    })),
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "STORE_CREATE",
      targetType: "Store",
      targetId: store.id,
      detail: JSON.stringify({ name }),
    },
  });

  revalidatePath("/settings/stores");
  revalidatePath("/");
}

export async function updateStoreNameAction(storeId: string, name: string) {
  const session = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.store.update({ where: { id: storeId }, data: { name: trimmed } });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "STORE_UPDATE",
      targetType: "Store",
      targetId: storeId,
      detail: JSON.stringify({ name: trimmed }),
    },
  });
  revalidatePath("/settings/stores");
  revalidatePath("/");
}

export async function toggleStoreActiveAction(storeId: string, isActive: boolean) {
  await requireAdmin();
  await prisma.store.update({ where: { id: storeId }, data: { isActive } });
  revalidatePath("/settings/stores");
  revalidatePath("/");
}

export async function toggleStoreGroupAction(storeId: string, includeInGroup: boolean) {
  await requireAdmin();
  await prisma.store.update({ where: { id: storeId }, data: { includeInGroup } });
  revalidatePath("/settings/stores");
  revalidatePath("/");
  revalidatePath("/pl/group");
}

export async function deleteStoreAction(storeId: string) {
  const session = await requireAdmin();
  await prisma.store.delete({ where: { id: storeId } });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "STORE_DELETE",
      targetType: "Store",
      targetId: storeId,
    },
  });
  revalidatePath("/settings/stores");
  revalidatePath("/");
}

/** Notionの店舗名(notionLabel)と紐付けるNOTE AI店舗を設定する。他店舗が既に同じlabelを持っていれば解除してから付け替える。 */
export async function updateNotionStoreMappingAction(
  notionLabel: string,
  newStoreId: string | null
) {
  await requireAdmin();
  await prisma.$transaction(async (tx) => {
    await tx.store.updateMany({
      where: { notionLabel },
      data: { notionLabel: null },
    });
    if (newStoreId) {
      await tx.store.update({ where: { id: newStoreId }, data: { notionLabel } });
    }
  });
  revalidatePath("/settings/notion");
}

export async function moveStoreAction(storeId: string, direction: "up" | "down") {
  await requireAdmin();
  const stores = await prisma.store.findMany({ orderBy: { sortOrder: "asc" } });
  const index = stores.findIndex((s) => s.id === storeId);
  if (index === -1) return;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= stores.length) return;

  const a = stores[index];
  const b = stores[swapWith];
  await prisma.$transaction([
    prisma.store.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.store.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  revalidatePath("/settings/stores");
  revalidatePath("/");
}
