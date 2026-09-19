import { getAllStores } from "@/lib/stores";
import { StoreRow } from "@/components/settings/StoreRow";
import { createStoreAction } from "@/lib/actions/stores";
import { getAdminSession } from "@/lib/auth";
import { AccessDenied } from "@/components/settings/AccessDenied";

export default async function StoreSettingsPage() {
  const session = await getAdminSession();
  if (!session) return <AccessDenied />;

  const stores = await getAllStores();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">店舗管理</h1>
        <p className="text-sm text-foreground-muted">
          店舗の追加・編集・非表示・削除・並び替え・グループ集計対象の設定ができます。
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {stores.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            店舗が登録されていません。
          </p>
        )}
        {stores.map((store, i) => (
          <StoreRow
            key={store.id}
            store={store}
            isFirst={i === 0}
            isLast={i === stores.length - 1}
          />
        ))}
      </div>

      <form action={createStoreAction} className="flex gap-2">
        <input
          name="name"
          required
          placeholder="新しい店舗名"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
        >
          店舗を追加
        </button>
      </form>
    </div>
  );
}
