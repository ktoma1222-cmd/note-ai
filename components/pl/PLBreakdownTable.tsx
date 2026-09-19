import type { MonthlyPLInput, PLComputed } from "@/lib/pl-calculations";
import { formatCurrency, formatPercent } from "@/lib/format";

export function PLBreakdownTable({
  input,
  computed,
}: {
  input: MonthlyPLInput;
  computed: PLComputed;
}) {
  const rows: { label: string; value: number; indent?: boolean; strong?: boolean; rate?: number | null }[] = [
    { label: "売上高", value: input.revenue, strong: true },
    { label: "食材仕入", value: input.foodPurchase, indent: true },
    { label: "備品仕入", value: input.suppliesPurchase, indent: true },
    { label: "棚卸高(月初)", value: input.inventoryBeginning, indent: true },
    { label: "棚卸高(月末)", value: input.inventoryEnding, indent: true },
    { label: "売上原価", value: computed.costOfSales, strong: true, rate: computed.costRate },
    { label: "社員人件費", value: computed.staffLaborTotal, indent: true },
    { label: "アルバイト人件費", value: computed.partTimeLaborTotal, indent: true },
    { label: "人件費合計", value: computed.laborCostTotal, strong: true, rate: computed.laborCostRate },
    { label: "家賃", value: input.rent, indent: true, rate: computed.expenseRates.rent },
    { label: "広告宣伝費", value: input.advertising, indent: true, rate: computed.expenseRates.advertising },
    { label: "水道光熱費", value: input.utilities, indent: true, rate: computed.expenseRates.utilities },
    { label: "福利厚生費", value: input.welfare, indent: true, rate: computed.expenseRates.welfare },
    {
      label: "通信警備費",
      value: input.telecomSecurityTotal,
      indent: true,
      rate: computed.expenseRates.telecomSecurityTotal,
    },
    {
      label: "その他経費",
      value: input.otherExpenses,
      indent: true,
      rate: computed.expenseRates.otherExpenses,
    },
    { label: "総経費", value: computed.totalExpenses, strong: true },
    { label: "営業利益", value: computed.operatingProfit, strong: true, rate: computed.operatingProfitRate },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0 ${
            row.strong ? "bg-surface-muted" : ""
          } ${row.indent ? "pl-8" : ""}`}
        >
          <span className={`text-sm ${row.strong ? "font-semibold" : "text-foreground-muted"}`}>
            {row.label}
          </span>
          <span className="flex items-baseline gap-3">
            {row.rate !== undefined && row.rate !== null && (
              <span className="text-xs text-foreground-muted">{formatPercent(row.rate)}</span>
            )}
            <span className={`tabular-nums text-sm ${row.strong ? "font-semibold" : ""}`}>
              {formatCurrency(row.value)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
