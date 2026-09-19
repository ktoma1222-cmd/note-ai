import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getActiveStores } from "@/lib/stores";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { TopBar } from "@/components/layout/TopBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const stores = await getActiveStores();

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar userName={session.name} userRole={session.role} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Suspense fallback={<div className="h-[57px] border-b border-border" />}>
          <TopBar stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
        </Suspense>
        <main className="flex-1 pb-20 md:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
