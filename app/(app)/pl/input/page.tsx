import { getActiveStores } from "@/lib/stores";
import { getMonthlyPLRow } from "@/lib/pl-queries";
import { prisma } from "@/lib/prisma";
import { PLInputSelectors } from "./selectors";
import { PLInputForm, type PLInputInitialValues } from "@/components/pl/PLInputForm";

export default async function PLInputPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const stores = await getActiveStores();
  const storeId = firstValue(sp.storeId) ?? stores[0]?.id;
  const year = firstValue(sp.year)
    ? parseInt(firstValue(sp.year)!, 10)
    : new Date().getFullYear();
  const month = firstValue(sp.month)
    ? parseInt(firstValue(sp.month)!, 10)
    : new Date().getMonth() + 1;

  if (!storeId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <p className="text-sm text-foreground-muted">
          店舗が登録されていません。先に店舗管理から店舗を追加してください。
        </p>
      </div>
    );
  }

  const [existing, telecomItems] = await Promise.all([
    getMonthlyPLRow(storeId, year, month),
    prisma.telecomSecurityItem.findMany({
      where: { storeId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const telecomDetails: Record<string, number> = {};
  existing?.telecomSecurityDetails.forEach((d) => {
    telecomDetails[d.telecomSecurityItemId] = d.amount;
  });

  const initialValues: PLInputInitialValues = {
    revenue: existing?.revenue ?? 0,
    foodPurchase: existing?.foodPurchase ?? 0,
    suppliesPurchase: existing?.suppliesPurchase ?? 0,
    inventoryBeginning: existing?.inventoryBeginning ?? 0,
    inventoryEnding: existing?.inventoryEnding ?? 0,
    staffLaborBase: existing?.staffLaborBase ?? 0,
    staffLaborTransport: existing?.staffLaborTransport ?? 0,
    partTimeLaborBase: existing?.partTimeLaborBase ?? 0,
    partTimeLaborTransport: existing?.partTimeLaborTransport ?? 0,
    rent: existing?.rent ?? 0,
    advertising: existing?.advertising ?? 0,
    utilities: existing?.utilities ?? 0,
    welfare: existing?.welfare ?? 0,
    otherExpenses: existing?.otherExpenses ?? 0,
    telecomDetails,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">PL入力</h1>
        <p className="text-sm text-foreground-muted">
          店舗・年月を選択し、月次の数値を入力してください。
        </p>
      </div>
      <PLInputSelectors stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
      <PLInputForm
        key={`${storeId}-${year}-${month}`}
        storeId={storeId}
        year={year}
        month={month}
        initialValues={initialValues}
        telecomItems={telecomItems.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}

function firstValue(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
