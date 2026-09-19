type ImportLog = {
  id: string;
  filename: string;
  importedAt: Date;
  totalCount: number;
  newCount: number;
  updatedCount: number;
  cancelledCount: number;
  unchangedCount: number;
  duplicateCount: number;
  errorCount: number;
};

function formatDateTime(d: Date): string {
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReservationImportHistory({ logs }: { logs: ImportLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
        まだ取込履歴がありません。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{log.filename}</span>
            <span className="text-xs text-foreground-muted">{formatDateTime(log.importedAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
            <span>総件数 {log.totalCount}</span>
            <span>新規 {log.newCount}</span>
            <span>更新 {log.updatedCount}</span>
            <span>キャンセル {log.cancelledCount}</span>
            <span>変更なし {log.unchangedCount}</span>
            <span>重複候補 {log.duplicateCount}</span>
            <span className={log.errorCount > 0 ? "text-negative" : undefined}>エラー {log.errorCount}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
