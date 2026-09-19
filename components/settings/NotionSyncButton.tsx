"use client";

import { useState, useTransition } from "react";
import { syncNotionAction } from "@/lib/actions/notion-sync";

export function NotionSyncButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      const res = await syncNotionAction();
      if (!res.ok) {
        setMessage({ type: "error", text: res.error });
        return;
      }
      const { created, updated, processed, skippedStores, errors } = res.result;
      const skipped = Object.values(skippedStores).reduce((a, b) => a + b, 0);
      const skippedNote =
        skipped > 0
          ? ` / 店舗未マッピングでスキップ ${skipped}件(${Object.entries(skippedStores)
              .map(([label, n]) => `${label}:${n}`)
              .join(", ")})`
          : "";
      const errorNote = errors.length > 0 ? ` / エラー ${errors.length}件` : "";
      setMessage({
        type: errors.length > 0 ? "error" : "success",
        text: `同期完了: ${processed}件処理(新規${created} / 更新${updated})${skippedNote}${errorNote}`,
      });
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "同期中..." : "今すぐ同期"}
      </button>
      {message && (
        <span className={message.type === "success" ? "text-sm text-positive" : "text-sm text-negative"}>
          {message.text}
        </span>
      )}
    </div>
  );
}
