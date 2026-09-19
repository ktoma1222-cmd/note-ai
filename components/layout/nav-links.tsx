"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// AIチャット("/ai")は2026-09-20、ユーザー判断によりGemini連携ごと停止した。
// コード自体(app/(app)/ai, components/ai, lib/ai, lib/actions/ai-chat.ts)は
// 再開に備えて残し、ナビゲーション・検索からのみ外す。
const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/pl/group", label: "PL" },
  { href: "/customers", label: "Customers" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings/stores", label: "店舗管理" },
  { href: "/settings", label: "設定" },
];

export function NavLinks({ variant = "sidebar" }: { variant?: "sidebar" | "mobile" }) {
  const pathname = usePathname();

  if (variant === "mobile") {
    const mobileItems = [
      { href: "/", label: "Dashboard" },
      { href: "/pl/group", label: "PL" },
      { href: "/customers", label: "Customers" },
      { href: "/analytics", label: "Analytics" },
      { href: "/settings", label: "More" },
    ];
    return (
      <>
        {mobileItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[11px]",
                active ? "text-accent" : "text-foreground-muted"
              )}
            >
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-accent" : "bg-transparent"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "block rounded-lg px-3 py-2 text-sm transition",
              active
                ? "bg-white/10 font-medium text-sidebar-foreground"
                : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}
