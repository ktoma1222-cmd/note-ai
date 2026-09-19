"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MONTH_LABELS } from "@/lib/period";

export function PLInputSelectors({
  stores,
}: {
  stores: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const storeId = searchParams.get("storeId") ?? stores[0]?.id ?? "";
  const year = searchParams.get("year") ?? String(new Date().getFullYear());
  const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => params.set(k, v));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={storeId}
        onChange={(e) => update({ storeId: e.target.value })}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => update({ year: e.target.value })}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {Array.from({ length: 9 }, (_, i) => new Date().getFullYear() - 6 + i).map(
          (y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          )
        )}
      </select>
      <select
        value={month}
        onChange={(e) => update({ month: e.target.value })}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {MONTH_LABELS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
