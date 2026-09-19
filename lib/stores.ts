import "server-only";
import { prisma } from "@/lib/prisma";

export async function getActiveStores() {
  return prisma.store.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getAllStores() {
  return prisma.store.findMany({
    orderBy: { sortOrder: "asc" },
  });
}

export async function getStoreById(storeId: string) {
  return prisma.store.findUnique({ where: { id: storeId } });
}

export async function getGroupIncludedStores() {
  return prisma.store.findMany({
    where: { isActive: true, includeInGroup: true },
    orderBy: { sortOrder: "asc" },
  });
}
