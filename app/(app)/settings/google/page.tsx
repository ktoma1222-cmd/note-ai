import Link from "next/link";
import { getAllStores } from "@/lib/stores";
import { getGoogleConnection } from "@/lib/integrations/google-sheets";
import { disconnectGoogleAction } from "@/lib/actions/google-sheets";
import { StoreSheetRow } from "@/components/settings/StoreSheetRow";
import { getAdminSession } from "@/lib/auth";
import { AccessDenied } from "@/components/settings/AccessDenied";

export default async function GoogleSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminSession();
  if (!session) return <AccessDenied />;

  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const connected = sp.connected;

  const stores = await getAllStores();
  const connection = await getGoogleConnection();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-lg font-semibold">Google連携</h1>
        <p className="text-sm text-foreground-muted">
          PLスプレッドシート(閲覧権限のみでOK)から数値を取り込むための接続設定です。
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/5 p-4 text-sm text-negative">
          {error}
        </p>
      )}
      {connected && (
        <p className="rounded-lg border border-positive/30 bg-positive/5 p-4 text-sm text-positive">
          Googleアカウントを接続しました。
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        {connection ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">接続済み</p>
              <p className="text-xs text-foreground-muted">{connection.googleEmail}</p>
            </div>
            <form action={disconnectGoogleAction}>
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
              >
                接続解除
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground-muted">まだ接続されていません。</p>
            <Link
              href="/api/auth/google/connect"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
            >
              Googleでこのシートに接続
            </Link>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground-muted">店舗ごとのスプレッドシート</p>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {stores.map((store) => (
            <StoreSheetRow
              key={store.id}
              store={{ id: store.id, name: store.name, googleSheetId: store.googleSheetId }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
