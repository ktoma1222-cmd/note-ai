import { LoginForm } from "./login-form";
import { sanitizeNextPath } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-sidebar-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-wide text-sidebar-foreground">
            NOTE AI
          </h1>
          <p className="mt-2 text-sm text-sidebar-muted">
            NOTEグループ経営管理システム
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-8 shadow-xl">
          <LoginForm next={sanitizeNextPath(next)} />
        </div>
      </div>
    </div>
  );
}
