import Link from "next/link";

const LINKS = [
  { href: "/settings/stores", label: "店舗管理", desc: "店舗の追加・編集・非表示・削除・並び替え" },
  { href: "/settings/telecom-items", label: "通信警備費 内訳管理", desc: "内訳項目の追加・編集・削除" },
  { href: "/settings/notion", label: "Notion連携", desc: "顧客・来店データの同期設定と店舗名マッピング" },
  { href: "/settings/google", label: "Google連携", desc: "PLスプレッドシートの接続設定" },
  { href: "/settings/tablecheck", label: "TableCheck予約同期", desc: "CSV取込による予約データの登録・店舗名マッピング" },
  { href: "/settings/users", label: "ユーザー管理", desc: "権限(Admin/Manager/Staff)の設定 — Phase 1では準備中" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 md:px-6">
      <h1 className="text-lg font-semibold">設定</h1>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-muted"
          >
            <p className="text-sm font-medium">{link.label}</p>
            <p className="text-xs text-foreground-muted">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
