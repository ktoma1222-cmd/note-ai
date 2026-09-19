export function AccessDenied() {
  return (
    <div className="mx-auto max-w-2xl space-y-2 px-4 py-6 md:px-6">
      <p className="rounded-lg border border-negative/30 bg-negative/5 p-4 text-sm text-negative">
        この画面を表示するには管理者権限が必要です。
      </p>
    </div>
  );
}
