"use client";

import { useState, useTransition } from "react";
import { setStoreGoogleSheetAction, bulkImportPLFromGoogleSheetAction } from "@/lib/actions/google-sheets";

export function StoreSheetRow({
  store,
}: {
  store: { id: string; name: string; googleSheetId: string | null };
}) {
  const [value, setValue] = useState(store.googleSheetId ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      try {
        await setStoreGoogleSheetAction(store.id, value);
        setMessage("保存しました。");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleBulkImport() {
    setBulkMessage(null);
    startBulkTransition(async () => {
      const result = await bulkImportPLFromGoogleSheetAction(store.id);
      if (!result.ok) {
        setBulkMessage({ type: "error", text: result.error });
        return;
      }
      const range =
        result.imported.length > 0
          ? `${result.imported[0].year}年${result.imported[0].month}月 〜 ${
              result.imported[result.imported.length - 1].year
            }年${result.imported[result.imported.length - 1].month}月`
          : "";
      setBulkMessage({
        type: "success",
        text: `${result.imported.length}ヶ月分を取り込みました(新規${result.created} / 更新${result.updated})。${range}`,
      });
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 text-sm font-medium">{store.name}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="スプレッドシートのURL"
          className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50"
        >
          保存
        </button>
        {message && <span className="text-xs text-foreground-muted">{message}</span>}
      </div>
      {store.googleSheetId && (
        <div className="flex flex-wrap items-center gap-2 pl-[88px]">
          <button
            type="button"
            onClick={handleBulkImport}
            disabled={bulkPending}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {bulkPending ? "取り込み中..." : "全期間を一括取り込む(確認なしで保存)"}
          </button>
          {bulkMessage && (
            <span
              className={bulkMessage.type === "success" ? "text-xs text-positive" : "text-xs text-negative"}
            >
              {bulkMessage.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
