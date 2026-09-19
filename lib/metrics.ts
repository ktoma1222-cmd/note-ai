import type { PLMetricKey } from "@/lib/pl-queries";

// PL指標の静的な表示設定。値そのものを計算する関数(lib/kpi.ts, lib/pl-queries.ts)には依存しない
// (クライアントコンポーネントである高速検索から参照してもserver-onlyコードを巻き込まないようにするため)。

export type MetricConfig = {
  key: PLMetricKey;
  label: string;
  isRate: boolean;
  higherIsBetter: boolean;
};

export const METRICS: Record<
  | "revenue"
  | "costOfSales"
  | "costRate"
  | "laborCostTotal"
  | "laborCostRate"
  | "operatingProfit"
  | "operatingProfitRate",
  MetricConfig
> = {
  revenue: { key: "revenue", label: "売上高", isRate: false, higherIsBetter: true },
  costOfSales: { key: "costOfSales", label: "売上原価", isRate: false, higherIsBetter: false },
  costRate: { key: "costRate", label: "原価率", isRate: true, higherIsBetter: false },
  laborCostTotal: { key: "laborCostTotal", label: "人件費", isRate: false, higherIsBetter: false },
  laborCostRate: { key: "laborCostRate", label: "人件費率", isRate: true, higherIsBetter: false },
  operatingProfit: { key: "operatingProfit", label: "営業利益", isRate: false, higherIsBetter: true },
  operatingProfitRate: { key: "operatingProfitRate", label: "営業利益率", isRate: true, higherIsBetter: true },
};
