"use client";

import { useState, useTransition } from "react";
import { syncTableCheckToNotionAction } from "@/lib/actions/tablecheck-notion-sync";

type SyncResult = {
  processed: number;
  created: number;
  updated: number;
  errors: string[];
  abortedDueToPermission: boolean;
};

export function TableCheckNotionSyncPanel({
  notSyncedCount,
  lastResult,
}: {
  notSyncedCount: number;
  lastResult: SyncResult | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true; result: SyncResult } | { ok: false; error: string } | null
  >(null);

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      const res = await syncTableCheckToNotionAction();
      setResult(res);
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Notion未同期の予約: {notSyncedCount}件</p>
          {lastResult && (
            <p className="text-xs text-foreground-muted">
              前回同期: 処理{lastResult.processed}件(新規{lastResult.created}・更新{lastResult.updated}
              {lastResult.errors.length > 0 ? `・エラー${lastResult.errors.length}` : ""})
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={pending || notSyncedCount === 0}
          onClick={handleSync}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "同期中...(件数によっては数分かかります)" : "Notionへ未同期予約を同期"}
        </button>
      </div>

      {result && result.ok && result.result.abortedDueToPermission && (
        <p className="rounded-lg border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
          Notion側の書き込み権限が不足しているため中断しました。Notionのワークスペース管理者に、このIntegrationの「Capabilities」で「Update content」「Insert content」を有効にしてもらってから再度お試しください(処理{result.result.processed}
          件の時点で中断)。
        </p>
      )}
      {result && result.ok && !result.result.abortedDueToPermission && (
        <p className="rounded-lg border border-positive/30 bg-positive/5 p-3 text-sm text-positive">
          同期が完了しました。処理{result.result.processed}件・新規作成{result.result.created}件・更新
          {result.result.updated}件
          {result.result.errors.length > 0 ? `・エラー${result.result.errors.length}件` : ""}
        </p>
      )}
      {result && !result.ok && (
        <p className="rounded-lg border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
          {result.error}
        </p>
      )}
    </div>
  );
}
