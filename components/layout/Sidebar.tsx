import Link from "next/link";
import { NavLinks } from "./nav-links";
import { logoutAction } from "@/lib/actions/auth";

export function Sidebar({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar-bg text-sidebar-foreground md:flex">
      <div className="px-6 py-6">
        <Link href="/" className="text-xl font-semibold tracking-wide">
          NOTE AI
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        <NavLinks />
      </nav>
      <div className="border-t border-white/10 px-4 py-4">
        <p className="truncate text-sm font-medium">{userName}</p>
        <p className="text-xs text-sidebar-muted">{roleLabel(userRole)}</p>
        <form action={logoutAction} className="mt-3">
          <button
            type="submit"
            className="text-xs text-sidebar-muted underline-offset-2 hover:text-sidebar-foreground hover:underline"
          >
            ログアウト
          </button>
        </form>
      </div>
    </aside>
  );
}

function roleLabel(role: string) {
  switch (role) {
    case "ADMIN":
      return "管理者";
    case "MANAGER":
      return "マネージャー";
    default:
      return "スタッフ";
  }
}
