"use client";

import { useState, useTransition } from "react";
import {
  updateStoreNameAction,
  toggleStoreActiveAction,
  toggleStoreGroupAction,
  deleteStoreAction,
  moveStoreAction,
} from "@/lib/actions/stores";

export function StoreRow({
  store,
  isFirst,
  isLast,
}: {
  store: { id: string; name: string; isActive: boolean; includeInGroup: boolean };
  isFirst: boolean;
  isLast: boolean;
}) {
  const [name, setName] = useState(store.name);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-col">
        <button
          type="button"
          disabled={isFirst || pending}
          onClick={() => startTransition(() => moveStoreAction(store.id, "up"))}
          className="text-xs text-foreground-muted disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          disabled={isLast || pending}
          onClick={() => startTransition(() => moveStoreAction(store.id, "down"))}
          className="text-xs text-foreground-muted disabled:opacity-30"
        >
          ▼
        </button>
      </div>

      <div className="min-w-[160px] flex-1">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== store.name) {
                startTransition(() => updateStoreNameAction(store.id, name));
              }
            }}
            autoFocus
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium hover:underline"
          >
            {store.name}
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={store.isActive}
          onChange={(e) =>
            startTransition(() => toggleStoreActiveAction(store.id, e.target.checked))
          }
        />
        表示中
      </label>

      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={store.includeInGroup}
          onChange={(e) =>
            startTransition(() => toggleStoreGroupAction(store.id, e.target.checked))
          }
        />
        グループ集計対象
      </label>

      <button
        type="button"
        onClick={() => {
          if (confirm(`「${store.name}」を削除しますか?関連するPLデータもすべて削除されます。`)) {
            startTransition(() => deleteStoreAction(store.id));
          }
        }}
        className="ml-auto text-xs text-negative hover:underline"
      >
        削除
      </button>
    </div>
  );
}
