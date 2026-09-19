"use client";

import { useMemo, useState, useTransition } from "react";
import { savePLAction } from "@/lib/actions/pl";
import { fetchPLFromGoogleSheetAction } from "@/lib/actions/google-sheets";
import { computePL } from "@/lib/pl-calculations";
import { formatCurrency, formatPercent } from "@/lib/format";

type TelecomItem = { id: string; name: string };

export type PLInputInitialValues = {
  revenue: number;
  foodPurchase: number;
  suppliesPurchase: number;
  inventoryBeginning: number;
  inventoryEnding: number;
  staffLaborBase: number;
  staffLaborTransport: number;
  partTimeLaborBase: number;
  partTimeLaborTransport: number;
  rent: number;
  advertising: number;
  utilities: number;
  welfare: number;
  otherExpenses: number;
  telecomDetails: Record<string, number>;
};

export function PLInputForm({
  storeId,
  year,
  month,
  initialValues,
  telecomItems,
}: {
  storeId: string;
  year: number;
  month: number;
  initialValues: PLInputInitialValues;
  telecomItems: TelecomItem[];
}) {
  const [values, setValues] = useState(initialValues);
  const [showStaff, setShowStaff] = useState(false);
  const [showPartTime, setShowPartTime] = useState(false);
  const [showTelecom, setShowTelecom] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [importPending, startImportTransition] = useTransition();
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const telecomTotal = useMemo(
    () => Object.values(values.telecomDetails).reduce((s, v) => s + v, 0),
    [values.telecomDetails]
  );

  const computed = useMemo(
    () =>
      computePL({
        revenue: values.revenue,
        foodPurchase: values.foodPurchase,
        suppliesPurchase: values.suppliesPurchase,
        inventoryBeginning: values.inventoryBeginning,
        inventoryEnding: values.inventoryEnding,
        staffLaborBase: values.staffLaborBase,
        staffLaborTransport: values.staffLaborTransport,
        partTimeLaborBase: values.partTimeLaborBase,
        partTimeLaborTransport: values.partTimeLaborTransport,
        rent: values.rent,
        advertising: values.advertising,
        utilities: values.utilities,
        welfare: values.welfare,
        otherExpenses: values.otherExpenses,
        telecomSecurityTotal: telecomTotal,
      }),
    [values, telecomTotal]
  );

  function setField(key: keyof Omit<PLInputInitialValues, "telecomDetails">, raw: string) {
    const num = raw === "" ? 0 : Number(raw);
    setValues((v) => ({ ...v, [key]: Number.isFinite(num) ? num : 0 }));
  }

  function setTelecomField(itemId: string, raw: string) {
    const num = raw === "" ? 0 : Number(raw);
    setValues((v) => ({
      ...v,
      telecomDetails: { ...v.telecomDetails, [itemId]: Number.isFinite(num) ? num : 0 },
    }));
  }

  function handleImportFromGoogle() {
    setImportMessage(null);
    startImportTransition(async () => {
      const result = await fetchPLFromGoogleSheetAction(storeId, year, month);
      if (!result.ok) {
        setImportMessage({ type: "error", text: result.error });
        return;
      }
      const v = result.values;
      setValues((prev) => {
        // 通信警備費は合計値のみ取得されるため、内訳の最初の項目にまとめて反映する
        // (内訳が必要な場合は取り込み後に手動で調整する)
        const telecomDetails = { ...prev.telecomDetails };
        const firstItemId = telecomItems[0]?.id;
        if (firstItemId) {
          Object.keys(telecomDetails).forEach((id) => {
            telecomDetails[id] = 0;
          });
          telecomDetails[firstItemId] = v.telecomSecurityTotal;
        }
        return {
          revenue: v.revenue,
          foodPurchase: v.foodPurchase,
          suppliesPurchase: v.suppliesPurchase,
          inventoryBeginning: v.inventoryBeginning,
          inventoryEnding: v.inventoryEnding,
          staffLaborBase: v.staffLaborBase,
          staffLaborTransport: 0,
          partTimeLaborBase: v.partTimeLaborBase,
          partTimeLaborTransport: 0,
          rent: v.rent,
          advertising: v.advertising,
          utilities: v.utilities,
          welfare: v.welfare,
          otherExpenses: v.otherExpenses,
          telecomDetails,
        };
      });
      setImportMessage({ type: "success", text: "取り込みました。内容を確認して保存してください。" });
    });
  }

  function handleSubmit() {
    setMessage(null);
    startTransition(async () => {
      const result = await savePLAction({
        storeId,
        year,
        month,
        revenue: values.revenue,
        foodPurchase: values.foodPurchase,
        suppliesPurchase: values.suppliesPurchase,
        inventoryBeginning: values.inventoryBeginning,
        inventoryEnding: values.inventoryEnding,
        staffLaborBase: values.staffLaborBase,
        staffLaborTransport: values.staffLaborTransport,
        partTimeLaborBase: values.partTimeLaborBase,
        partTimeLaborTransport: values.partTimeLaborTransport,
        rent: values.rent,
        advertising: values.advertising,
        utilities: values.utilities,
        welfare: values.welfare,
        otherExpenses: values.otherExpenses,
        telecomDetails: telecomItems.map((item) => ({
          itemId: item.id,
          amount: values.telecomDetails[item.id] ?? 0,
        })),
      });
      if (result.ok) {
        setMessage({ type: "success", text: "保存しました。" });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleImportFromGoogle}
          disabled={importPending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
        >
          {importPending ? "取り込み中..." : "Googleシートから取り込む"}
        </button>
        {importMessage && (
          <span
            className={importMessage.type === "success" ? "text-sm text-positive" : "text-sm text-negative"}
          >
            {importMessage.text}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <Row label="売上高">
          <NumberInput value={values.revenue} onChange={(v) => setField("revenue", v)} autoFocus />
        </Row>

        <SectionHeader label="売上原価" />
        <Row label="食材仕入">
          <NumberInput value={values.foodPurchase} onChange={(v) => setField("foodPurchase", v)} />
        </Row>
        <Row label="備品仕入">
          <NumberInput value={values.suppliesPurchase} onChange={(v) => setField("suppliesPurchase", v)} />
        </Row>
        <Row label="棚卸高(月初)">
          <NumberInput value={values.inventoryBeginning} onChange={(v) => setField("inventoryBeginning", v)} />
        </Row>
        <Row label="棚卸高(月末)">
          <NumberInput value={values.inventoryEnding} onChange={(v) => setField("inventoryEnding", v)} />
        </Row>

        <SectionHeader label="人件費" />
        <ExpandableRow
          label="社員人件費"
          total={values.staffLaborBase + values.staffLaborTransport}
          expanded={showStaff}
          onToggle={() => setShowStaff((s) => !s)}
        >
          <Row label="社員給与" indent>
            <NumberInput value={values.staffLaborBase} onChange={(v) => setField("staffLaborBase", v)} />
          </Row>
          <Row label="社員交通費" indent>
            <NumberInput value={values.staffLaborTransport} onChange={(v) => setField("staffLaborTransport", v)} />
          </Row>
        </ExpandableRow>
        <ExpandableRow
          label="アルバイト人件費"
          total={values.partTimeLaborBase + values.partTimeLaborTransport}
          expanded={showPartTime}
          onToggle={() => setShowPartTime((s) => !s)}
        >
          <Row label="アルバイト給与" indent>
            <NumberInput value={values.partTimeLaborBase} onChange={(v) => setField("partTimeLaborBase", v)} />
          </Row>
          <Row label="アルバイト交通費" indent>
            <NumberInput value={values.partTimeLaborTransport} onChange={(v) => setField("partTimeLaborTransport", v)} />
          </Row>
        </ExpandableRow>

        <SectionHeader label="固定費・経費" />
        <Row label="家賃">
          <NumberInput value={values.rent} onChange={(v) => setField("rent", v)} />
        </Row>
        <Row label="広告宣伝費">
          <NumberInput value={values.advertising} onChange={(v) => setField("advertising", v)} />
        </Row>
        <Row label="水道光熱費">
          <NumberInput value={values.utilities} onChange={(v) => setField("utilities", v)} />
        </Row>
        <Row label="福利厚生費">
          <NumberInput value={values.welfare} onChange={(v) => setField("welfare", v)} />
        </Row>
        <Row label="その他経費">
          <NumberInput value={values.otherExpenses} onChange={(v) => setField("otherExpenses", v)} />
        </Row>
        <ExpandableRow
          label="通信警備費"
          total={telecomTotal}
          expanded={showTelecom}
          onToggle={() => setShowTelecom((s) => !s)}
        >
          {telecomItems.length === 0 && (
            <p className="px-4 py-2 text-xs text-foreground-muted">
              内訳項目が登録されていません。設定から追加できます。
            </p>
          )}
          {telecomItems.map((item) => (
            <Row key={item.id} label={item.name} indent>
              <NumberInput
                value={values.telecomDetails[item.id] ?? 0}
                onChange={(v) => setTelecomField(item.id, v)}
              />
            </Row>
          ))}
        </ExpandableRow>
      </div>

      <div className="rounded-xl border border-border bg-surface-muted p-4">
        <p className="mb-3 text-sm font-medium text-foreground-muted">自動計算結果(プレビュー)</p>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <PreviewItem label="原価率" value={formatPercent(computed.costRate)} />
          <PreviewItem label="人件費率" value={formatPercent(computed.laborCostRate)} />
          <PreviewItem label="営業利益" value={formatCurrency(computed.operatingProfit)} />
          <PreviewItem label="営業利益率" value={formatPercent(computed.operatingProfitRate)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存"}
        </button>
        {message && (
          <span className={message.type === "success" ? "text-sm text-positive" : "text-sm text-negative"}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
  indent = false,
}: {
  label: string;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0 ${
        indent ? "bg-surface-muted pl-8" : ""
      }`}
    >
      <span className="text-sm text-foreground-muted">{label}</span>
      {children}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-border bg-surface-muted px-4 py-1.5">
      <span className="text-xs font-semibold tracking-wide text-foreground-muted">{label}</span>
    </div>
  );
}

function ExpandableRow({
  label,
  total,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition hover:bg-surface-muted"
      >
        <span className="flex items-center gap-2 text-sm text-foreground-muted">
          <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
          {label}
        </span>
        <span className="tabular-nums text-sm font-medium">{formatCurrency(total)}</span>
      </button>
      {expanded && <div>{children}</div>}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  autoFocus,
}: {
  value: number;
  onChange: (raw: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={value === 0 ? "" : value}
      placeholder="0"
      onChange={(e) => onChange(e.target.value)}
      className="w-36 rounded-lg border border-border bg-background px-3 py-1.5 text-right text-sm tabular-nums outline-none focus:border-accent md:w-48"
    />
  );
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="tabular-nums text-lg font-semibold">{value}</p>
    </div>
  );
}
