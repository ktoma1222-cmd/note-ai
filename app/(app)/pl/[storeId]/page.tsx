import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePeriodSelection } from "@/lib/period";
import { getStoreById } from "@/lib/stores";
import {
  getMonthlyComparisons,
  getMonthlyPLInput,
  getYearlyMonthlyInputs,
  getYearlyPLComputed,
} from "@/lib/pl-queries";
import { sumMonthlyPLInputs, type MonthlyPLInput } from "@/lib/pl-calculations";
import { KpiGrid } from "@/components/pl/KpiGrid";
import { PLBreakdownTable } from "@/components/pl/PLBreakdownTable";

export default async function StorePLPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const store = await getStoreById(storeId);
  if (!store) notFound();

  const resolvedParams = await searchParams;
  const { year, month } = resolvePeriodSelection({ ...resolvedParams, store: storeId });
  const isYearly = month === null;

  const periodLabel = isYearly ? `${year}年(年間)` : `${year}年${month}月`;

  if (isYearly) {
    const inputs = (await getYearlyMonthlyInputs(storeId, year)).filter(
      (v): v is MonthlyPLInput => v !== null
    );
    const current = inputs.length > 0 ? sumMonthlyPLInputs(inputs) : null;
    const currentComputed = await getYearlyPLComputed(storeId, year);
    const prevYearComputed = await getYearlyPLComputed(storeId, year - 1);

    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
        <Header storeName={store.name} periodLabel={periodLabel} storeId={storeId} />
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
          <NoData periodLabel={periodLabel} storeId={storeId} />
        )}
      </div>
    );
  }

  const comparisons = await getMonthlyComparisons(storeId, year, month!);
  const currentInput = await getMonthlyPLInput(storeId, year, month!);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <Header storeName={store.name} periodLabel={periodLabel} storeId={storeId} />
      <KpiGrid
        comparisons={comparisons}
        referenceKeys={[
          { key: "previousMonth", label: "前月比" },
          { key: "previousYearSameMonth", label: "前年同月比" },
          { key: "yearAverage", label: "年間平均比" },
          { key: "otherStoresAverage", label: "他店舗平均比" },
          { key: "groupAverage", label: "グループ平均比" },
        ]}
      />
      {currentInput && comparisons.current ? (
        <PLBreakdownTable input={currentInput} computed={comparisons.current} />
      ) : (
        <NoData periodLabel={periodLabel} storeId={storeId} />
      )}
    </div>
  );
}

function Header({
  storeName,
  periodLabel,
  storeId,
}: {
  storeName: string;
  periodLabel: string;
  storeId: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">{storeName} PL</h1>
        <p className="text-sm text-foreground-muted">{periodLabel}</p>
      </div>
      <Link
        href={`/pl/input?storeId=${storeId}`}
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
      >
        PL入力へ
      </Link>
    </div>
  );
}

function NoData({ periodLabel, storeId }: { periodLabel: string; storeId: string }) {
  return (
    <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
      {periodLabel}のPLデータがまだ入力されていません。
      <Link href={`/pl/input?storeId=${storeId}`} className="ml-1 text-accent underline">
        PL入力画面へ
      </Link>
    </p>
  );
}
