"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type RevealPhoneResult = { ok: true; phone: string } | { ok: false; error: string };

export async function revealCustomerPhoneAction(customerId: string): Promise<RevealPhoneResult> {
  const session = await getSession();
  if (!session || session.role === "STAFF") {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "顧客が見つかりません。" };

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "CUSTOMER_PHONE_REVEAL",
      targetType: "Customer",
      targetId: customerId,
    },
  });

  return { ok: true, phone: customer.phone ?? "" };
}

export async function toggleRepeaterOverrideAction(customerId: string, isRepeater: boolean | null) {
  const session = await getSession();
  if (!session || session.role === "STAFF") return;
  await prisma.customer.update({
    where: { id: customerId },
    data: { isRepeaterOverride: isRepeater },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "CUSTOMER_REPEATER_OVERRIDE",
      targetType: "Customer",
      targetId: customerId,
      detail: JSON.stringify({ isRepeater }),
    },
  });
  revalidatePath("/customers");
}
