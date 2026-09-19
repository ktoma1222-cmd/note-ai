import { getActiveStores } from "@/lib/stores";
import { prisma } from "@/lib/prisma";
import { TelecomStoreSelector } from "./store-selector";
import { TelecomItemRow } from "@/components/settings/TelecomItemRow";
import { createTelecomItemAction } from "@/lib/actions/telecom-items";
import { getAdminSession } from "@/lib/auth";
import { AccessDenied } from "@/components/settings/AccessDenied";

export default async function TelecomItemsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (!session) return <AccessDenied />;

  const sp = await searchParams;
  const stores = await getActiveStores();
  const storeIdParam = Array.isArray(sp.storeId) ? sp.storeId[0] : sp.storeId;
  const storeId = storeIdParam ?? stores[0]?.id;

  const items = storeId
    ? await prisma.telecomSecurityItem.findMany({
        where: { storeId },
        orderBy: { sortOrder: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">通信警備費 内訳管理</h1>
        <p className="text-sm text-foreground-muted">
          PL上は「通信警備費」1項目として表示されますが、店舗ごとに内訳を管理できます。
        </p>
      </div>

      <TelecomStoreSelector stores={stores.map((s) => ({ id: s.id, name: s.name }))} />

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            内訳項目が登録されていません。
          </p>
        )}
        {items.map((item) => (
          <TelecomItemRow key={item.id} item={item} />
        ))}
      </div>

      {storeId && (
        <form action={createTelecomItemAction} className="flex gap-2">
          <input type="hidden" name="storeId" value={storeId} />
          <input
            name="name"
            required
            placeholder="新しい内訳項目名"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
          >
            追加
          </button>
        </form>
      )}
    </div>
  );
}
