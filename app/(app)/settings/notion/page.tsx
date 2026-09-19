import { getAllStores } from "@/lib/stores";
import { getNotionStoreOptions } from "@/lib/integrations/notion";
import { prisma } from "@/lib/prisma";
import { NotionStoreMappingRow } from "@/components/settings/NotionStoreMappingRow";
import { getAdminSession } from "@/lib/auth";
import { AccessDenied } from "@/components/settings/AccessDenied";

// 2026-09-18、ユーザー判断によりNotionからの今後の同期は停止し、以後はTableCheck CSV取込を
// 予約データの正とする方針に変更した([[project-tablecheck-csv-import]]参照)。
// 既存のNotion由来データ(Customer/Visit)はDBに残し、TableCheckがカバーしていない古い期間の
// 参考データとして引き続き使う(lib/unified-reservation-queries.tsのフォールバック)ため、
// このページ自体・店舗名マッピングの参照情報は残すが、同期ボタンは非表示にする。

export default async function NotionSettingsPage() {
  const session = await getAdminSession();
  if (!session) return <AccessDenied />;

  const stores = await getAllStores();

  let notionOptions: string[] = [];
  let notionError: string | null = null;
  try {
    notionOptions = await getNotionStoreOptions();
  } catch (err) {
    notionError = err instanceof Error ? err.message : String(err);
  }

  const syncState = await prisma.syncState.findUnique({ where: { id: "notion" } });
  let lastResult: { processed: number; created: number; updated: number } | null = null;
  if (syncState?.lastResult) {
    try {
      lastResult = JSON.parse(syncState.lastResult);
    } catch {
      lastResult = null;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">Notion連携</h1>
        <p className="text-sm text-foreground-muted">
          今後の予約データはTableCheck CSV取込(設定 → TableCheck予約同期)を正として運用するため、Notionからの同期は停止しています。
          既存の取込済みデータは、TableCheckがカバーしていない期間の参考情報としてそのまま利用しています。店舗名マッピングは過去の同期履歴の参照用です。
        </p>
      </div>

      {notionError ? (
        <p className="rounded-lg border border-negative/30 bg-negative/5 p-4 text-sm text-negative">
          Notionへの接続に失敗しました: {notionError}
          <br />
          `.env` の `NOTION_API_KEY` / `NOTION_CUSTOMER_DB_ID` を確認してください。
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {notionOptions.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-foreground-muted">
                Notion側に店舗名の選択肢が見つかりませんでした。
              </p>
            )}
            {notionOptions.map((label) => (
              <NotionStoreMappingRow
                key={label}
                notionLabel={label}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                mappedStoreId={stores.find((s) => s.notionLabel === label)?.id ?? null}
              />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <p className="text-xs text-foreground-muted">
              {syncState?.lastSyncedAt ? (
                <>
                  最終同期(停止済み): {new Date(syncState.lastSyncedAt).toLocaleString("ja-JP")}
                  {lastResult && ` (処理${lastResult.processed}件 / 新規${lastResult.created} / 更新${lastResult.updated})`}
                </>
              ) : (
                "まだ同期していません。"
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
