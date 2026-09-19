"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function TelecomStoreSelector({
  stores,
}: {
  stores: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId") ?? stores[0]?.id ?? "";

  return (
    <select
      value={storeId}
      onChange={(e) => router.push(`${pathname}?storeId=${e.target.value}`)}
      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
    >
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
