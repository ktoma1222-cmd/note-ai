import clsx from "clsx";
import type { Tone } from "@/lib/format";

export type KpiComparison = {
  label: string;
  text: string;
  tone: Tone;
};

export function KpiCard({
  label,
  value,
  comparisons = [],
}: {
  label: string;
  value: string;
  comparisons?: KpiComparison[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {comparisons.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-2">
          {comparisons.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-xs">
              <span className="text-foreground-muted">{c.label}</span>
              <span
                className={clsx(
                  "tabular-nums font-medium",
                  c.tone === "positive" && "text-positive",
                  c.tone === "negative" && "text-negative",
                  c.tone === "neutral" && "text-foreground-muted"
                )}
              >
                {c.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
