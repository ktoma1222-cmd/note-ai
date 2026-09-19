import { getAdminSession } from "@/lib/auth";
import { AccessDenied } from "@/components/settings/AccessDenied";

export default async function UsersSettingsPage() {
  const session = await getAdminSession();
  if (!session) return <AccessDenied />;

  return (
    <div className="mx-auto max-w-2xl space-y-2 px-4 py-6 md:px-6">
      <h1 className="text-lg font-semibold">ユーザー管理</h1>
      <p className="text-sm text-foreground-muted">
        Admin / Manager / Staff の権限管理はPHASE 1の範囲外です。現在はシード投入された管理者アカウントのみで運用します。今後のフェーズで、ユーザー招待・担当店舗の割り当て・権限変更に対応します。
      </p>
    </div>
  );
}
