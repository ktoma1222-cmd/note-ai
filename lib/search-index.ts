// 高速検索(トップバー)の検索対象定義。店舗・PL指標・主要ページのみを対象とし、
// 顧客の氏名・電話番号などの個人情報はインデックスに含めない。
import { METRICS } from "@/lib/metrics";

export type SearchResultType = "store-metric" | "store" | "metric" | "page";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  label: string;
  description?: string;
  href: string;
};

type StoreOption = { id: string; name: string };

type PageEntry = { label: string; href: string; keywords: string[] };

const PAGES: PageEntry[] = [
  { label: "Dashboard", href: "/", keywords: ["ダッシュボード", "dashboard", "トップ"] },
  { label: "NOTE GROUP PL", href: "/pl/group", keywords: ["グループpl", "全体pl", "pl"] },
  { label: "PL入力", href: "/pl/input", keywords: ["pl入力", "入力"] },
  { label: "Customers", href: "/customers", keywords: ["顧客", "customers", "来店"] },
  { label: "Analytics", href: "/analytics", keywords: ["分析", "analytics"] },
  { label: "NOTE AI", href: "/ai", keywords: ["ai", "チャット", "note ai"] },
  { label: "店舗管理", href: "/settings/stores", keywords: ["店舗管理", "店舗設定"] },
  { label: "設定", href: "/settings", keywords: ["設定", "settings"] },
  { label: "Google連携", href: "/settings/google", keywords: ["google", "スプレッドシート", "sheets"] },
  { label: "Notion連携", href: "/settings/notion", keywords: ["notion", "予約"] },
  { label: "通信警備費項目", href: "/settings/telecom-items", keywords: ["通信警備費"] },
  { label: "ユーザー管理", href: "/settings/users", keywords: ["ユーザー", "user"] },
];

const METRIC_LIST = Object.values(METRICS);

function matchesToken(target: string, token: string) {
  return target.toLowerCase().includes(token.toLowerCase());
}

export function buildSearchResults(
  query: string,
  stores: StoreOption[],
  period: { year: number; month: number | null }
): SearchResult[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const matchedStores = stores.filter((s) => tokens.some((t) => matchesToken(s.name, t)));
  const matchedMetrics = METRIC_LIST.filter((m) => tokens.some((t) => matchesToken(m.label, t)));
  const matchedPages = PAGES.filter((p) =>
    tokens.some((t) => matchesToken(p.label, t) || p.keywords.some((k) => matchesToken(k, t)))
  );

  const periodQuery = period.month ? `year=${period.year}&month=${period.month}` : `year=${period.year}&month=ALL`;

  const results: SearchResult[] = [];

  if (matchedStores.length > 0 && matchedMetrics.length > 0) {
    for (const store of matchedStores) {
      for (const metric of matchedMetrics) {
        results.push({
          id: `store-metric-${store.id}-${metric.key}`,
          type: "store-metric",
          label: `${store.name} の ${metric.label}`,
          description: "店舗別PL詳細を開く",
          href: `/pl/${store.id}?${periodQuery}`,
        });
      }
    }
  } else if (matchedStores.length > 0) {
    for (const store of matchedStores) {
      results.push({
        id: `store-${store.id}`,
        type: "store",
        label: `${store.name} のPL`,
        description: "店舗別PL詳細を開く",
        href: `/pl/${store.id}?${periodQuery}`,
      });
    }
  } else if (matchedMetrics.length > 0) {
    for (const metric of matchedMetrics) {
      results.push({
        id: `metric-${metric.key}`,
        type: "metric",
        label: `グループ全体の ${metric.label}`,
        description: "NOTE GROUP PLを開く",
        href: `/pl/group?${periodQuery}`,
      });
    }
  }

  for (const page of matchedPages) {
    results.push({
      id: `page-${page.href}`,
      type: "page",
      label: page.label,
      href: page.href,
    });
  }

  return results.slice(0, 8);
}
