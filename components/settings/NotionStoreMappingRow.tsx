"use client";

import { useTransition } from "react";
import { updateNotionStoreMappingAction } from "@/lib/actions/stores";

export function NotionStoreMappingRow({
  notionLabel,
  stores,
  mappedStoreId,
}: {
  notionLabel: string;
  stores: { id: string; name: string }[];
  mappedStoreId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-sm font-medium">{notionLabel}</span>
      <select
        disabled={pending}
        value={mappedStoreId ?? ""}
        onChange={(e) =>
          startTransition(() =>
            updateNotionStoreMappingAction(notionLabel, e.target.value || null)
          )
        }
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
      >
        <option value="">未設定(同期対象外)</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
