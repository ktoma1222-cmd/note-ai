"use client";

import { useState, useTransition } from "react";
import { revealCustomerPhoneAction, toggleRepeaterOverrideAction } from "@/lib/actions/customers";

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "確認",
  REQUESTED: "リクエスト",
  CANCELLED: "キャンセル",
};

// visitにはphoneMasked(マスク済み)のみを渡し、生のphoneは渡さないこと。
// このコンポーネントは"use client"のため、propsに生の電話番号を含めるとReact Server Componentsの
// flightペイロードにマスク前の値がそのまま含まれてしまう(セキュリティ監査finding:
// customerrow-dead-code-raw-phone-prop)。実際の番号は必ずrevealCustomerPhoneAction経由でのみ取得する。
export function CustomerRow({
  visit,
}: {
  visit: {
    id: string;
    visitDateTime: string | null;
    storeName: string;
    customerId: string;
    customerName: string;
    phoneMasked: string;
    country: string | null;
    region: string | null;
    purpose: string | null;
    status: string;
    isNewVisit: boolean;
    isRepeaterOverride: boolean | null;
    partySize: number | null;
  };
}) {
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isRepeater = visit.isRepeaterOverride ?? !visit.isNewVisit;

  function handleReveal() {
    startTransition(async () => {
      const res = await revealCustomerPhoneAction(visit.customerId);
      if (res.ok) setRevealedPhone(res.phone || "(未登録)");
    });
  }

  function handleToggleRepeater() {
    startTransition(() => toggleRepeaterOverrideAction(visit.customerId, !isRepeater));
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
        {visit.visitDateTime ? new Date(visit.visitDateTime).toLocaleDateString("ja-JP") : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{visit.storeName}</td>
      <td className="px-3 py-2 text-sm font-medium">{visit.customerName}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
        {revealedPhone ? (
          revealedPhone
        ) : (
          <button
            type="button"
            onClick={handleReveal}
            disabled={pending}
            className="text-foreground-muted hover:text-accent hover:underline"
          >
            {visit.phoneMasked}
          </button>
        )}
      </td>
      <td className="hidden px-3 py-2 text-xs text-foreground-muted md:table-cell">{visit.country ?? "—"}</td>
      <td className="hidden px-3 py-2 text-xs text-foreground-muted md:table-cell">{visit.purpose ?? "—"}</td>
      <td className="hidden px-3 py-2 text-xs text-foreground-muted md:table-cell">{visit.partySize ?? "—"}</td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={handleToggleRepeater}
          disabled={pending}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isRepeater ? "bg-accent/15 text-accent" : "bg-surface-muted text-foreground-muted"
          }`}
          title="クリックで新規/リピーターを手動切替"
        >
          {isRepeater ? "リピーター" : "新規"}
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
        {STATUS_LABEL[visit.status] ?? visit.status}
      </td>
    </tr>
  );
}
