import "server-only";
import { getAllStores } from "@/lib/stores";
import {
  getMonthlyComputedForStoreOrGroup,
  getYearlyComputedForStoreOrGroup,
  getMonthlyComparisons,
  getGroupMonthlyComparisons,
  getTrendSeries,
  getStoreComparisonForPeriod,
  getStoreYearlyComparisonForPeriod,
  getBreakEvenForStoreOrGroup,
} from "@/lib/pl-queries";
import { resolveVisitStoreFilter, buildVisitWhere, getRegionBreakdown } from "@/lib/customer-queries";
import {
  resolveReservationStoreFilter,
  buildReservationWhere,
  getReservationCount,
  getReservationStatusCounts,
  getReservationSyncStatusCounts,
} from "@/lib/reservation-queries";
import {
  getUnifiedReservationSummary,
  getUnifiedPurposeBreakdown,
  getUnifiedChannelBreakdown,
  getUnifiedNewRepeatBreakdown,
} from "@/lib/unified-reservation-queries";
import type { ClaudeToolDeclaration } from "@/lib/integrations/claude";

// NOTE AIチャットが呼び出せるツール定義。新しい集計ロジックは書かず、
// 既存のPL/顧客クエリ関数(lib/pl-queries.ts, lib/customer-queries.ts)をラップするだけにする。
// 顧客の氏名・電話番号などの個人情報は返さない(集計値のみ)。

export const AI_TOOL_DECLARATIONS: ClaudeToolDeclaration[] = [
  {
    name: "list_stores",
    description:
      "NOTE GROUPに登録されている全店舗の一覧(店舗ID・店舗名)を取得する。店舗名を店舗IDに変換する際に使う。",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_monthly_pl",
    description:
      "指定した店舗(またはグループ全体)の指定年月のPL(売上高・原価・人件費・営業利益等)と、前月・前年同月・年間平均・他店舗平均との比較を取得する。",
    input_schema: {
      type: "object",
      properties: {
        store: { type: "string", description: "店舗名、店舗ID、またはグループ全体を指す \"group\"" },
        year: { type: "number", description: "西暦年" },
        month: { type: "number", description: "月(1〜12)" },
      },
      required: ["store", "year", "month"],
    },
  },
  {
    name: "get_yearly_pl",
    description: "指定した店舗(またはグループ全体)の指定年の年間PLを取得する。",
    input_schema: {
      type: "object",
      properties: {
        store: { type: "string", description: "店舗名、店舗ID、またはグループ全体を指す \"group\"" },
        year: { type: "number", description: "西暦年" },
      },
      required: ["store", "year"],
    },
  },
  {
    name: "get_trend",
    description:
      "指定した店舗(またはグループ全体)の、指定終了年月からさかのぼった月次推移(売上高・営業利益・原価率・人件費率)を取得する。",
    input_schema: {
      type: "object",
      properties: {
        store: { type: "string", description: "店舗名、店舗ID、またはグループ全体を指す \"group\"" },
        endYear: { type: "number", description: "終了年(西暦)" },
        endMonth: { type: "number", description: "終了月(1〜12)" },
        months: { type: "number", description: "さかのぼる月数(既定12)" },
      },
      required: ["store", "endYear", "endMonth"],
    },
  },
  {
    name: "get_store_comparison",
    description: "指定した年月(月を省略すると年間)について、グループ内の各店舗ごとの売上高・営業利益を比較する。",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "number", description: "西暦年" },
        month: { type: "number", description: "月(1〜12)。省略時は年間比較。" },
      },
      required: ["year"],
    },
  },
  {
    name: "get_break_even_point",
    description:
      "指定した店舗(またはグループ全体)の損益分岐点売上高を計算する。社員人件費は固定費、アルバイト人件費は変動費として扱い、" +
      "固定費・変動費・変動費率・損益分岐点売上高・実績売上高との差(安全余裕率)を返す。monthを省略すると年間ベースで計算する。",
    input_schema: {
      type: "object",
      properties: {
        store: { type: "string", description: "店舗名、店舗ID、またはグループ全体を指す \"group\"" },
        year: { type: "number", description: "西暦年" },
        month: { type: "number", description: "月(1〜12)。省略すると年間ベースで計算する。" },
      },
      required: ["store", "year"],
    },
  },
  {
    name: "get_reservation_summary",
    description:
      "指定した店舗(またはグループ全体)・指定期間の予約組数・予約人数・残り組数・残り人数・予想売上(estimatedRevenue)・残り予想売上を取得する。「予約は何組/何人」「今月の予想売上は」のような質問にはまずこのツールを使うこと。" +
      "店舗・年月ごとにTableCheck取込データがあればそちらを優先し、無い場合はNotion連携のデータを使う統合済みの数値(ダッシュボード・Customers画面と同じ集計方式)。予想売上はTableCheck予約の「注文合計金額」(コース料金×人数)の合計で、Notionのみのデータの期間や、コース事前注文の無い予約は含まれない(0円寄りになりうる)点に注意。",
    input_schema: {
      type: "object",
      properties: {
        store: { type: "string", description: "店舗名、店舗ID、またはグループ全体を指す \"group\"" },
        year: { type: "number", description: "西暦年" },
        month: { type: "number", description: "月(1〜12)。省略時は年間集計。" },
      },
      required: ["store", "year"],
    },
  },
  {
    name: "get_customer_breakdown",
    description:
      "指定した店舗(またはグループ全体)・指定期間の予約/来店データについて、内訳(国籍/地域、利用用途、予約経路、新規/リピーターのいずれか)の集計件数を取得する。個人の氏名・電話番号などは含まれない。" +
      "国籍/地域以外(利用用途・予約経路・新規/リピーター)は、店舗・年月ごとにTableCheck取込データがあればそちらを優先する統合済みの集計(Analytics画面と同じ)。国籍/地域のみNotion連携のデータのみを使う(TableCheck側は自由記述で粒度が異なるため)。",
    input_schema: {
      type: "object",
      properties: {
        store: { type: "string", description: "店舗名、店舗ID、またはグループ全体を指す \"group\"" },
        year: { type: "number", description: "西暦年" },
        month: { type: "number", description: "月(1〜12)。省略時は年間集計。" },
        breakdownType: {
          type: "string",
          description: "集計軸",
          enum: ["region", "purpose", "reservationSource", "newRepeat"],
        },
      },
      required: ["store", "year", "breakdownType"],
    },
  },
  {
    name: "get_tablecheck_reservation_summary",
    description:
      "指定した店舗(またはグループ全体)・指定期間について、TableCheckからCSV取込した予約データそのものの件数・ステータス内訳(確定/キャンセル/仮予約)・Notion未同期件数を取得する。" +
      "「予約は何組/何人」のような一般的な質問にはget_reservation_summaryを使うこと。このツールは「Notion未同期は何件か」等、TableCheck側固有の情報が必要な場合のみ使う。",
    input_schema: {
      type: "object",
      properties: {
        store: { type: "string", description: "店舗名、店舗ID、またはグループ全体を指す \"group\"" },
        year: { type: "number", description: "西暦年" },
        month: { type: "number", description: "月(1〜12)。省略時は年間集計。" },
      },
      required: ["store", "year"],
    },
  },
];

async function resolveStoreNameOrId(
  input: string
): Promise<{ id: string; name: string } | "group" | null> {
  if (input === "group" || input === "グループ" || input === "全店舗" || input === "NOTE GROUP") {
    return "group";
  }
  const stores = await getAllStores();
  const exact = stores.find((s) => s.id === input || s.name === input);
  if (exact) return { id: exact.id, name: exact.name };
  const partial = stores.find((s) => s.name.includes(input) || input.includes(s.name));
  if (partial) return { id: partial.id, name: partial.name };
  return null;
}

export async function executeAiTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (name) {
    case "list_stores": {
      const stores = await getAllStores();
      return { stores: stores.map((s) => ({ id: s.id, name: s.name })) };
    }

    case "get_monthly_pl": {
      const storeInput = String(args.store ?? "group");
      const year = Number(args.year);
      const month = Number(args.month);
      const resolved = await resolveStoreNameOrId(storeInput);
      if (resolved === null) return { error: `店舗「${storeInput}」が見つかりませんでした。` };
      const storeParam = resolved === "group" ? "group" : resolved.id;
      const storeLabel = resolved === "group" ? "NOTE GROUP" : resolved.name;

      const computed = await getMonthlyComputedForStoreOrGroup(storeParam, year, month);
      if (!computed) {
        return { error: `${storeLabel}の${year}年${month}月のPLデータはまだ登録されていません。` };
      }
      const comparisons =
        storeParam === "group"
          ? await getGroupMonthlyComparisons(year, month)
          : await getMonthlyComparisons(storeParam, year, month);

      return {
        store: storeLabel,
        year,
        month,
        current: computed,
        comparisons: {
          previousMonth: comparisons.previousMonth,
          previousYearSameMonth: comparisons.previousYearSameMonth,
          yearAverage: comparisons.yearAverage,
          otherStoresAverage: comparisons.otherStoresAverage,
          groupAverage: comparisons.groupAverage,
        },
      };
    }

    case "get_yearly_pl": {
      const storeInput = String(args.store ?? "group");
      const year = Number(args.year);
      const resolved = await resolveStoreNameOrId(storeInput);
      if (resolved === null) return { error: `店舗「${storeInput}」が見つかりませんでした。` };
      const storeParam = resolved === "group" ? "group" : resolved.id;
      const storeLabel = resolved === "group" ? "NOTE GROUP" : resolved.name;

      const computed = await getYearlyComputedForStoreOrGroup(storeParam, year);
      if (!computed) {
        return { error: `${storeLabel}の${year}年のPLデータはまだ登録されていません。` };
      }
      return { store: storeLabel, year, computed };
    }

    case "get_trend": {
      const storeInput = String(args.store ?? "group");
      const endYear = Number(args.endYear);
      const endMonth = Number(args.endMonth);
      const months = args.months ? Number(args.months) : 12;
      const resolved = await resolveStoreNameOrId(storeInput);
      if (resolved === null) return { error: `店舗「${storeInput}」が見つかりませんでした。` };
      const storeParam = resolved === "group" ? "group" : resolved.id;
      const storeLabel = resolved === "group" ? "NOTE GROUP" : resolved.name;

      const trend = await getTrendSeries(storeParam, endYear, endMonth, months);
      return { store: storeLabel, trend };
    }

    case "get_store_comparison": {
      const year = Number(args.year);
      const month = args.month !== undefined && args.month !== null ? Number(args.month) : null;
      const comparison = month
        ? await getStoreComparisonForPeriod(year, month)
        : await getStoreYearlyComparisonForPeriod(year);
      return { year, month, comparison };
    }

    case "get_break_even_point": {
      const storeInput = String(args.store ?? "group");
      const year = Number(args.year);
      const month = args.month !== undefined && args.month !== null ? Number(args.month) : undefined;
      const resolved = await resolveStoreNameOrId(storeInput);
      if (resolved === null) return { error: `店舗「${storeInput}」が見つかりませんでした。` };
      const storeParam = resolved === "group" ? "group" : resolved.id;
      const storeLabel = resolved === "group" ? "NOTE GROUP" : resolved.name;

      const breakEven = await getBreakEvenForStoreOrGroup(storeParam, year, month);
      if (!breakEven) {
        return {
          error: `${storeLabel}の${year}年${month ? `${month}月` : ""}のPLデータはまだ登録されていません。`,
        };
      }
      if (breakEven.breakEvenRevenue === null) {
        return {
          store: storeLabel,
          year,
          month: month ?? null,
          variableCost: breakEven.variableCost,
          fixedCost: breakEven.fixedCost,
          variableCostRate: breakEven.variableCostRate,
          note: "変動費率が100%以上のため、この売上構造では損益分岐点(黒字化できる売上高)が数学的に存在しません。",
        };
      }
      return {
        store: storeLabel,
        year,
        month: month ?? null,
        variableCost: breakEven.variableCost,
        fixedCost: breakEven.fixedCost,
        variableCostRate: breakEven.variableCostRate,
        breakEvenRevenue: breakEven.breakEvenRevenue,
        actualRevenue: breakEven.actualRevenue,
        marginOfSafety: breakEven.marginOfSafety,
      };
    }

    case "get_reservation_summary": {
      const storeInput = String(args.store ?? "group");
      const year = Number(args.year);
      const month = args.month !== undefined && args.month !== null ? Number(args.month) : null;
      const resolved = await resolveStoreNameOrId(storeInput);
      if (resolved === null) return { error: `店舗「${storeInput}」が見つかりませんでした。` };
      const storeParam = resolved === "group" ? "group" : resolved.id;
      const storeLabel = resolved === "group" ? "NOTE GROUP" : resolved.name;

      const summary = await getUnifiedReservationSummary(storeParam, year, month);
      return { store: storeLabel, year, month, ...summary };
    }

    case "get_customer_breakdown": {
      const storeInput = String(args.store ?? "group");
      const year = Number(args.year);
      const month = args.month !== undefined && args.month !== null ? Number(args.month) : null;
      const breakdownType = String(args.breakdownType ?? "region");
      const resolved = await resolveStoreNameOrId(storeInput);
      if (resolved === null) return { error: `店舗「${storeInput}」が見つかりませんでした。` };
      const storeParam = resolved === "group" ? "group" : resolved.id;
      const storeLabel = resolved === "group" ? "NOTE GROUP" : resolved.name;

      let breakdown: { label: string; count: number }[];
      switch (breakdownType) {
        case "region": {
          const storeFilter = await resolveVisitStoreFilter(storeParam);
          const where = buildVisitWhere(storeFilter, year, month);
          breakdown = await getRegionBreakdown(where);
          break;
        }
        case "purpose":
          breakdown = await getUnifiedPurposeBreakdown(storeParam, year, month);
          break;
        case "reservationSource":
          breakdown = await getUnifiedChannelBreakdown(storeParam, year, month);
          break;
        case "newRepeat":
          breakdown = await getUnifiedNewRepeatBreakdown(storeParam, year, month);
          break;
        default:
          return { error: `不明な集計軸: ${breakdownType}` };
      }
      const total = breakdown.reduce((sum, item) => sum + item.count, 0);
      return { store: storeLabel, year, month, total, breakdown };
    }

    case "get_tablecheck_reservation_summary": {
      const storeInput = String(args.store ?? "group");
      const year = Number(args.year);
      const month = args.month !== undefined && args.month !== null ? Number(args.month) : null;
      const resolved = await resolveStoreNameOrId(storeInput);
      if (resolved === null) return { error: `店舗「${storeInput}」が見つかりませんでした。` };
      const storeParam = resolved === "group" ? "group" : resolved.id;
      const storeLabel = resolved === "group" ? "NOTE GROUP" : resolved.name;

      const storeFilter = await resolveReservationStoreFilter(storeParam);
      const where = buildReservationWhere(storeFilter, year, month);
      const [total, statusCounts, syncCounts] = await Promise.all([
        getReservationCount(where),
        getReservationStatusCounts(where),
        getReservationSyncStatusCounts(where),
      ]);

      return {
        store: storeLabel,
        year,
        month,
        total,
        statusCounts,
        notionSyncCounts: syncCounts,
        note: "これはNotion連携の来店データとは別のデータソース(TableCheck CSV取込)であり、重複排除はされていません。",
      };
    }

    default:
      return { error: `不明なツール: ${name}` };
  }
}
