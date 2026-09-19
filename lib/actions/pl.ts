"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, hasStoreAccess } from "@/lib/auth";

const payloadSchema = z.object({
  storeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  revenue: z.number().min(0),
  foodPurchase: z.number().min(0),
  suppliesPurchase: z.number().min(0),
  inventoryBeginning: z.number().min(0),
  inventoryEnding: z.number().min(0),
  staffLaborBase: z.number().min(0),
  staffLaborTransport: z.number().min(0),
  partTimeLaborBase: z.number().min(0),
  partTimeLaborTransport: z.number().min(0),
  rent: z.number().min(0),
  advertising: z.number().min(0),
  utilities: z.number().min(0),
  welfare: z.number().min(0),
  otherExpenses: z.number().min(0),
  telecomDetails: z.array(
    z.object({ itemId: z.string().min(1), amount: z.number().min(0) })
  ),
});

export type SavePLPayload = z.infer<typeof payloadSchema>;

export type SavePLResult = { ok: true } | { ok: false; error: string };

export async function savePLAction(raw: SavePLPayload): Promise<SavePLResult> {
  const session = await getSession();
  if (!session || session.role === "STAFF") {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "入力内容に誤りがあります。" };
  }
  const data = parsed.data;

  if (!(await hasStoreAccess(session, data.storeId))) {
    return { ok: false, error: "この店舗を操作する権限がありません。" };
  }

  const telecomSecurityTotal = data.telecomDetails.reduce(
    (sum, d) => sum + d.amount,
    0
  );

  const monthlyPL = await prisma.monthlyPL.upsert({
    where: {
      storeId_year_month: {
        storeId: data.storeId,
        year: data.year,
        month: data.month,
      },
    },
    update: {
      revenue: data.revenue,
      foodPurchase: data.foodPurchase,
      suppliesPurchase: data.suppliesPurchase,
      inventoryBeginning: data.inventoryBeginning,
      inventoryEnding: data.inventoryEnding,
      staffLaborBase: data.staffLaborBase,
      staffLaborTransport: data.staffLaborTransport,
      partTimeLaborBase: data.partTimeLaborBase,
      partTimeLaborTransport: data.partTimeLaborTransport,
      rent: data.rent,
      advertising: data.advertising,
      utilities: data.utilities,
      welfare: data.welfare,
      otherExpenses: data.otherExpenses,
      telecomSecurityTotal,
      updatedBy: session.userId,
    },
    create: {
      storeId: data.storeId,
      year: data.year,
      month: data.month,
      revenue: data.revenue,
      foodPurchase: data.foodPurchase,
      suppliesPurchase: data.suppliesPurchase,
      inventoryBeginning: data.inventoryBeginning,
      inventoryEnding: data.inventoryEnding,
      staffLaborBase: data.staffLaborBase,
      staffLaborTransport: data.staffLaborTransport,
      partTimeLaborBase: data.partTimeLaborBase,
      partTimeLaborTransport: data.partTimeLaborTransport,
      rent: data.rent,
      advertising: data.advertising,
      utilities: data.utilities,
      welfare: data.welfare,
      otherExpenses: data.otherExpenses,
      telecomSecurityTotal,
      updatedBy: session.userId,
    },
  });

  await Promise.all(
    data.telecomDetails.map((d) =>
      prisma.telecomSecurityDetail.upsert({
        where: {
          monthlyPLId_telecomSecurityItemId: {
            monthlyPLId: monthlyPL.id,
            telecomSecurityItemId: d.itemId,
          },
        },
        update: { amount: d.amount },
        create: {
          monthlyPLId: monthlyPL.id,
          telecomSecurityItemId: d.itemId,
          amount: d.amount,
        },
      })
    )
  );

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "PL_SAVE",
      targetType: "MonthlyPL",
      targetId: monthlyPL.id,
      detail: JSON.stringify({ storeId: data.storeId, year: data.year, month: data.month }),
    },
  });

  revalidatePath("/");
  revalidatePath("/pl/group");
  revalidatePath(`/pl/${data.storeId}`);

  return { ok: true };
}
