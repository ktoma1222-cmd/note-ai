import { resolvePeriodSelection } from "@/lib/period";
import {
  getGroupMonthlyComparisons,
  getGroupMonthlyPLInput,
  getGroupYearlyPLComputed,
  getGroupYearlyPLInputs,
} from "@/lib/pl-queries";
import { sumMonthlyPLInputs } from "@/lib/pl-calculations";
import { KpiGrid } from "@/components/pl/KpiGrid";
import { PLBreakdownTable } from "@/components/pl/PLBreakdownTable";
import { getGroupIncludedStores } from "@/lib/stores";

export default async function GroupPLPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const { year, month } = resolvePeriodSelection({ ...resolvedParams, store: "group" });
  const isYearly = month === null;
  const periodLabel = isYearly ? `${year}年(年間)` : `${year}年${month}月`;
  const memberStores = await getGroupIncludedStores();

  if (isYearly) {
    const inputs = await getGroupYearlyPLInputs(year);
    const current = inputs.length > 0 ? sumMonthlyPLInputs(inputs) : null;
    const currentComputed = await getGroupYearlyPLComputed(year);
    const prevYearComputed = await getGroupYearlyPLComputed(year - 1);

    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
        <Header periodLabel={periodLabel} storeNames={memberStores.map((s) => s.name)} />
        <KpiGrid
          comparisons={{
            current: currentComputed,
            previousMonth: null,
            previousYearSameMonth: prevYearComputed,
            yearAverage: null,
            otherStoresAverage: null,
            groupAverage: null,
          }}
          referenceKeys={[{ key: "previousYearSameMonth", label: "前年比" }]}
        />
        {current && currentComputed ? (
          <PLBreakdownTable input={current} computed={currentComputed} />
        ) : (
          <NoData periodLabel={periodLabel} />
        )}
      </div>
    );
  }

  const comparisons = await getGroupMonthlyComparisons(year, month!);
  const currentInput = await getGroupMonthlyPLInput(year, month!);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <Header periodLabel={periodLabel} storeNames={memberStores.map((s) => s.name)} />
      <KpiGrid
        comparisons={comparisons}
        referenceKeys={[
          { key: "previousMonth", label: "前月比" },
          { key: "previousYearSameMonth", label: "前年同月比" },
          { key: "yearAverage", label: "年間平均比" },
        ]}
      />
      {currentInput && comparisons.current ? (
        <PLBreakdownTable input={currentInput} computed={comparisons.current} />
      ) : (
        <NoData periodLabel={periodLabel} />
      )}
    </div>
  );
}

function Header({ periodLabel, storeNames }: { periodLabel: string; storeNames: string[] }) {
  return (
    <div>
      <h1 className="text-lg font-semibold">NOTE GROUP PL</h1>
      <p className="text-sm text-foreground-muted">
        {periodLabel} ・ 集計対象: {storeNames.length > 0 ? storeNames.join(" + ") : "なし"}
      </p>
    </div>
  );
}

function NoData({ periodLabel }: { periodLabel: string }) {
  return (
    <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
      {periodLabel}のグループPLデータがまだありません。各店舗のPLを入力すると自動的に集計されます。
    </p>
  );
}
