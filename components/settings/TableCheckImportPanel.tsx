"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  previewTableCheckCsvAction,
  confirmTableCheckCsvImportAction,
  type PreviewResult,
  type PreviewRowResult,
  type DuplicateResolution,
  type ConfirmImportResult,
} from "@/lib/actions/tablecheck-import";

const KIND_LABEL: Record<PreviewRowResult["kind"], string> = {
  NEW: "新規",
  UPDATED: "更新",
  CANCELLED: "キャンセル",
  UNCHANGED: "変更なし",
  POSSIBLE_DUPLICATE: "重複候補",
  ERROR: "エラー",
};

const KIND_BADGE_CLASS: Record<PreviewRowResult["kind"], string> = {
  NEW: "bg-positive/10 text-positive",
  UPDATED: "bg-accent/15 text-accent-foreground",
  CANCELLED: "bg-negative/10 text-negative",
  UNCHANGED: "bg-surface-muted text-foreground-muted",
  POSSIBLE_DUPLICATE: "bg-accent/20 text-accent-foreground",
  ERROR: "bg-negative/10 text-negative",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ja-JP");
}

type Resolution = { action: "NEW" | "MERGE"; existingId?: string };

export function TableCheckImportPanel() {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmPending, startConfirmTransition] = useTransition();
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({});
  const [confirmResult, setConfirmResult] = useState<ConfirmImportResult | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setConfirmResult(null);
    setResolutions({});
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const result = await previewTableCheckCsvAction(fd);
      setPreview(result);
      router.refresh(); // 新規に発見した店舗名マッピングを画面下部に反映させる
    });
  }

  function reset() {
    setPreview(null);
    setResolutions({});
    setConfirmResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function buildResolutions(): DuplicateResolution[] {
    if (!preview || !preview.ok) return [];
    const result: DuplicateResolution[] = [];
    for (const row of preview.rows) {
      if (row.kind !== "POSSIBLE_DUPLICATE") continue;
      const resolution = resolutions[row.rowId];
      if (!resolution) continue;
      result.push({ rowId: row.rowId, choice: resolution.action, mergeExistingId: resolution.existingId });
    }
    return result;
  }

  function handleConfirm() {
    if (!preview || !preview.ok) return;
    startConfirmTransition(async () => {
      const result = await confirmTableCheckCsvImportAction({
        sessionId: preview.sessionId,
        resolutions: buildResolutions(),
      });
      setConfirmResult(result);
    });
  }

  const unresolvedDuplicates =
    preview && preview.ok
      ? preview.rows.filter((r) => r.kind === "POSSIBLE_DUPLICATE" && !resolutions[r.rowId]).length
      : 0;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "cursor-pointer rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors",
          dragOver ? "border-accent bg-accent/5" : "border-border bg-surface-muted"
        )}
      >
        <p className="font-medium">TableCheck CSVをドラッグ&ドロップ</p>
        <p className="mt-1 text-xs text-foreground-muted">またはクリックしてファイルを選択</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {pending && <p className="text-sm text-foreground-muted">CSVを解析しています...</p>}

      {preview && !preview.ok && (
        <p className="rounded-lg border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
          {preview.error}
        </p>
      )}

      {preview && preview.ok && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {(
              [
                ["総件数", preview.summary.total, undefined],
                ["新規", preview.summary.new, "NEW"],
                ["更新", preview.summary.updated, "UPDATED"],
                ["キャンセル", preview.summary.cancelled, "CANCELLED"],
                ["重複候補", preview.summary.duplicate, "POSSIBLE_DUPLICATE"],
                ["エラー", preview.summary.error, "ERROR"],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="rounded-lg border border-border bg-surface p-3 text-center">
                <p className="text-xs text-foreground-muted">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{count}件</p>
              </div>
            ))}
          </div>

          {preview.unmappedStoreLabels.length > 0 && (
            <p className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm">
              未マッピングの店舗名が{preview.unmappedStoreLabels.length}件あります(
              {preview.unmappedStoreLabels.join("、")})。下の「店舗名マッピング」から割り当ててから再アップロードしてください。
            </p>
          )}

          {preview.unmatchedHeaders.length > 0 && (
            <p className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-foreground-muted">
              認識できなかった列: {preview.unmatchedHeaders.join("、")}
            </p>
          )}

          {preview.summary.error > 0 && (
            <RowGroup title="エラー" rows={preview.rows.filter((r) => r.kind === "ERROR")} />
          )}

          {preview.summary.duplicate > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">重複候補(要確認)</p>
              {preview.rows
                .filter((r) => r.kind === "POSSIBLE_DUPLICATE")
                .map((row) => (
                  <DuplicateRowCard
                    key={row.rowId}
                    row={row}
                    resolution={resolutions[row.rowId]}
                    onResolve={(res) => setResolutions((prev) => ({ ...prev, [row.rowId]: res }))}
                  />
                ))}
            </div>
          )}

          {(["NEW", "UPDATED", "CANCELLED", "UNCHANGED"] as const).map((kind) => {
            const rowsOfKind = preview.rows.filter((r) => r.kind === kind);
            if (rowsOfKind.length === 0) return null;
            return (
              <div key={kind}>
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                  className="text-sm font-medium text-accent-foreground underline-offset-2 hover:underline"
                >
                  {KIND_LABEL[kind]}({rowsOfKind.length}件)の詳細を{showDetails[kind] ? "隠す" : "表示"}
                </button>
                {showDetails[kind] && <RowGroup title={null} rows={rowsOfKind} />}
              </div>
            );
          })}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <button
              type="button"
              disabled={confirmPending}
              onClick={handleConfirm}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {confirmPending ? "同期中..." : "同期実行"}
            </button>
            <button type="button" onClick={reset} className="text-sm text-foreground-muted hover:underline">
              やり直す
            </button>
            {unresolvedDuplicates > 0 && (
              <span className="text-xs text-foreground-muted">
                未解決の重複候補{unresolvedDuplicates}件は今回スキップされます
              </span>
            )}
          </div>

          {confirmResult && confirmResult.ok && (
            <p className="rounded-lg border border-positive/30 bg-positive/5 p-3 text-sm text-positive">
              同期が完了しました。新規{confirmResult.created}件・更新{confirmResult.updated}件
              {confirmResult.errors > 0 ? `(エラー${confirmResult.errors}件)` : ""}
            </p>
          )}
          {confirmResult && !confirmResult.ok && (
            <p className="rounded-lg border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
              {confirmResult.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RowGroup({ title, rows }: { title: string | null; rows: PreviewRowResult[] }) {
  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-medium">{title}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <RowCard key={row.rowId} row={row} />
        ))}
      </div>
    </div>
  );
}

function RowCard({ row }: { row: PreviewRowResult }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{row.customerNameDisplay}</span>
        <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", KIND_BADGE_CLASS[row.kind])}>
          {KIND_LABEL[row.kind]}
        </span>
      </div>
      <p className="mt-1 text-xs text-foreground-muted">
        {row.storeLabel} ・ {formatDate(row.data?.visitDate ?? null)} {row.data?.visitTime ?? ""} ・{" "}
        {row.data?.partySize ?? "?"}名 ・ {row.phoneMasked}
      </p>
      {row.kind === "ERROR" && row.reason && <p className="mt-1 text-xs text-negative">{row.reason}</p>}
      {row.diffs && row.diffs.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-foreground-muted">
          {row.diffs.map((d) => (
            <li key={d.field}>
              {d.field}: {d.before || "(空欄)"} → {d.after || "(空欄)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DuplicateRowCard({
  row,
  resolution,
  onResolve,
}: {
  row: PreviewRowResult;
  resolution: Resolution | undefined;
  onResolve: (res: Resolution) => void;
}) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{row.customerNameDisplay}</span>
        {resolution && (
          <span className="rounded-full bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
            {resolution.action === "NEW" ? "新規登録に決定" : "統合に決定"}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-foreground-muted">
        {row.storeLabel} ・ {formatDate(row.data?.visitDate ?? null)} {row.data?.visitTime ?? ""} ・{" "}
        {row.data?.partySize ?? "?"}名 ・ {row.phoneMasked}
      </p>
      <p className="mt-2 text-xs font-medium text-foreground-muted">類似する既存予約:</p>
      <div className="mt-1 space-y-1">
        {row.candidates?.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded border border-border bg-surface px-2 py-1">
            <span className="text-xs">
              {c.customerName} ・ {c.visitTime ?? "時刻不明"} ・ {c.partySize ?? "?"}名 ・ {c.phoneMasked}
            </span>
            <button
              type="button"
              onClick={() => onResolve({ action: "MERGE", existingId: c.id })}
              className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
            >
              同一予約として統合
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onResolve({ action: "NEW" })}
        className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
      >
        別予約として登録
      </button>
    </div>
  );
}
