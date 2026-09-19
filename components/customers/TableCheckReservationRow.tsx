import { maskPhone } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "確定",
  REQUESTED: "仮予約",
  CANCELLED: "キャンセル",
  UNKNOWN: "不明",
};

export function TableCheckReservationRow({
  reservation,
}: {
  reservation: {
    id: string;
    visitDate: string;
    visitTime: string | null;
    storeName: string;
    customerName: string;
    phone: string | null;
    partySize: number | null;
    status: string;
    reservationSource: string;
  };
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
        {new Date(reservation.visitDate).toLocaleDateString("ja-JP")}
        {reservation.visitTime ? ` ${reservation.visitTime}` : ""}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-sm">{reservation.storeName}</td>
      <td className="px-3 py-2 text-sm font-medium">{reservation.customerName}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-foreground-muted">
        {maskPhone(reservation.phone)}
      </td>
      <td className="hidden px-3 py-2 text-xs text-foreground-muted md:table-cell">
        {reservation.partySize ?? "—"}
      </td>
      <td className="hidden px-3 py-2 text-xs text-foreground-muted md:table-cell">
        {reservation.reservationSource}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-foreground-muted">
        {STATUS_LABEL[reservation.status] ?? reservation.status}
      </td>
    </tr>
  );
}
