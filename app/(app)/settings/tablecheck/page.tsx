import { getSession } from "@/lib/auth";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { prisma } from "@/lib/prisma";
import { getAllStores } from "@/lib/stores";
import { TableCheckImportPanel } from "@/components/settings/TableCheckImportPanel";
import { TableCheckStoreMappingRow } from "@/components/settings/TableCheckStoreMappingRow";
import { ReservationImportHistory } from "@/components/settings/ReservationImportHistory";
import { listNeedsReviewFiles, getTablecheckInboxDir } from "@/lib/sync/tablecheck-folder-import";

// Notionへの書き戻し(PHASE 2)は実装済みだが、Notionワークスペースが第三者管理のため
// 書き込み権限を得られず、運用しない方針になった(2026-09-17、ユーザー判断)。
// 関連コード(lib/sync/tablecheck-to-notion-sync.ts, lib/actions/tablecheck-notion-sync.ts,
// components/settings/TableCheckNotionSyncPanel.tsx)は将来権限状況が変わった場合に備えて
// 削除せず残しているが、このページからは表示しない。

export default async function TableCheckSettingsPage() {
  const session = await getSession();
  if (!session || session.role === "STAFF") return <AccessDenied />;

  const [stores, mappings, logs, reservationCount, needsReviewFiles] = await Promise.all([
    getAllStores(),
    prisma.tableCheckStoreMapping.findMany({ orderBy: { rawLabel: "asc" } }),
    prisma.reservationImportLog.findMany({ orderBy: { importedAt: "desc" }, take: 20 }),
    prisma.reservation.count(),
    listNeedsReviewFiles(),
  ]);
  const inboxDir = getTablecheckInboxDir();

  const unmappedCount = mappings.filter((m) => !m.storeId).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">TableCheck予約同期</h1>
        <p className="text-sm text-foreground-muted">
          TableCheckからエクスポートしたCSVを取り込み、NOTE AI内部のReservationとして保存します。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-foreground-muted">NOTE AI登録予約</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{reservationCount}件</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-foreground-muted">未マッピングの店舗名</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{unmappedCount}件</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-xs text-foreground-muted">取込履歴</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{logs.length}件</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
        <p className="font-medium">自動取込(半自動化)</p>
        <p className="mt-1 text-foreground-muted">
          TableCheckからダウンロードしたCSVを、サーバー上の次のフォルダにそのまま置くと、定期ジョブが自動で取り込みます。
          新規・更新・キャンセル・変更なしの予約は自動反映され、重複の疑いがある予約だけがレビュー待ちとして残ります。
        </p>
        <code className="mt-2 block break-all rounded bg-surface px-2 py-1 text-xs">{inboxDir}/incoming/</code>
        {needsReviewFiles.length > 0 && (
          <div className="mt-3">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              レビュー待ちのファイル({needsReviewFiles.length}件)
            </p>
            <p className="mt-1 text-foreground-muted">
              重複の疑いがある予約、または読み取れなかった行を含むため自動反映されませんでした。下記のCSV取込に再アップロードして内容を確認してください(反映済みの行は「変更なし」として表示されます)。
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-foreground-muted">
              {needsReviewFiles.map((f) => (
                <li key={f} className="break-all">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground-muted">CSV取込(手動)</p>
        <TableCheckImportPanel />
      </div>

      {mappings.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground-muted">
            店舗名マッピング(CSV上の店舗名 → NOTE AIの店舗)
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {mappings.map((m) => (
              <TableCheckStoreMappingRow key={m.id} rawLabel={m.rawLabel} stores={stores} mappedStoreId={m.storeId} />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-foreground-muted">取込履歴</p>
        <ReservationImportHistory logs={logs} />
      </div>
    </div>
  );
}
