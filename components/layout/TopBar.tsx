"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MONTH_LABELS } from "@/lib/period";
import { buildSearchResults } from "@/lib/search-index";

type StoreOption = { id: string; name: string };

export function TopBar({ stores }: { stores: StoreOption[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const store = searchParams.get("store") ?? "group";
  const year = searchParams.get("year") ?? String(new Date().getFullYear());
  const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);
  const isYearly = searchParams.get("month") === "ALL";

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  const searchResults = useMemo(
    () =>
      buildSearchResults(query, stores, {
        year: parseInt(year, 10),
        month: isYearly ? null : parseInt(month, 10),
      }),
    [query, stores, year, month, isYearly]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goToResult(index: number) {
    const result = searchResults[index];
    if (!result) return;
    router.push(result.href);
    setQuery("");
    setOpen(false);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // 日本語入力(IME)の変換確定Enterでは遷移しない
      if (isComposingRef.current || e.keyCode === 229) return;
      e.preventDefault();
      goToResult(highlightIndex);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => params.set(k, v));
    router.push(`${pathname}?${params.toString()}`);
  }

  const showPeriodSelectors =
    pathname === "/" ||
    pathname.startsWith("/pl/") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/analytics");

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:px-6">
      {showPeriodSelectors && (
        <>
          <select
            value={store}
            onChange={(e) => update({ store: e.target.value })}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="group">NOTE GROUP</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => update({ year: e.target.value })}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>

          <div className="flex overflow-hidden rounded-lg border border-border text-sm">
            <button
              type="button"
              onClick={() => update({ month })}
              className={`px-3 py-1.5 ${!isYearly ? "bg-accent text-accent-foreground" : "bg-background"}`}
            >
              月次
            </button>
            <button
              type="button"
              onClick={() => update({ month: "ALL" })}
              className={`px-3 py-1.5 ${isYearly ? "bg-accent text-accent-foreground" : "bg-background"}`}
            >
              年次
            </button>
          </div>

          {!isYearly && (
            <select
              value={month}
              onChange={(e) => update({ month: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <div ref={searchBoxRef} className="relative ml-auto min-w-[160px] flex-1 md:flex-none md:w-72">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleSearchKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          placeholder="高速検索(例: ノ音 原価)"
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        />
        {open && searchResults.length > 0 && (
          <ul className="absolute right-0 top-full z-40 mt-1 w-full min-w-[240px] overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            {searchResults.map((result, i) => (
              <li key={result.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goToResult(i)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    i === highlightIndex ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"
                  }`}
                >
                  <div>{result.label}</div>
                  {result.description && (
                    <div
                      className={`text-xs ${
                        i === highlightIndex ? "text-accent-foreground/80" : "text-foreground-muted"
                      }`}
                    >
                      {result.description}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && query.trim() !== "" && searchResults.length === 0 && (
          <div className="absolute right-0 top-full z-40 mt-1 w-full min-w-[240px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground-muted shadow-lg">
            該当する結果がありません。
          </div>
        )}
      </div>
    </header>
  );
}

function yearOptions() {
  const current = new Date().getFullYear();
  // 過去のPLデータ(Google連携で数年分取り込まれる場合がある)もカバーできる範囲にする
  return Array.from({ length: 9 }, (_, i) => current - 6 + i);
}
