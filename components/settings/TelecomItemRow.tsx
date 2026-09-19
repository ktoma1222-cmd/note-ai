"use client";

import { useState, useTransition } from "react";
import {
  updateTelecomItemAction,
  toggleTelecomItemActiveAction,
  deleteTelecomItemAction,
} from "@/lib/actions/telecom-items";

export function TelecomItemRow({
  item,
}: {
  item: { id: string; name: string; isActive: boolean };
}) {
  const [name, setName] = useState(item.name);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <div className="min-w-[140px] flex-1">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== item.name) {
                startTransition(() => updateTelecomItemAction(item.id, name));
              }
            }}
            autoFocus
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-sm hover:underline">
            {item.name}
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={item.isActive}
          onChange={(e) =>
            startTransition(() => toggleTelecomItemActiveAction(item.id, e.target.checked))
          }
        />
        有効
      </label>
      <button
        type="button"
        onClick={() => {
          if (confirm(`「${item.name}」を削除しますか?`)) {
            startTransition(() => deleteTelecomItemAction(item.id));
          }
        }}
        className="ml-auto text-xs text-negative hover:underline"
      >
        削除
      </button>
    </div>
  );
}
