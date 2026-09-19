import "server-only";
import { normalizeName, normalizePhone, type ParsedReservationRow } from "@/lib/integrations/tablecheck-csv";

// CSV1行を、店舗マッピング解決後の予約として扱うための型。storeIdはCSV上の店舗名を
// TableCheckStoreMappingで解決した結果(未マッピングならnull)。
export type ResolvedCsvRow = ParsedReservationRow & { storeId: string | null };

export type ExistingReservationForMatch = {
  id: string;
  externalReservationId: string | null;
  storeId: string;
  customerName: string;
  phone: string | null;
  visitDate: Date;
  visitTime: string | null;
  partySize: number | null;
  status: string;
};

export type FieldDiff = { field: string; before: string; after: string };

export type ClassifiedRow =
  | { kind: "ERROR"; row: ResolvedCsvRow; reason: string }
  | { kind: "NEW"; row: ResolvedCsvRow }
  | { kind: "UNCHANGED"; row: ResolvedCsvRow; existingId: string }
  | { kind: "UPDATED"; row: ResolvedCsvRow; existingId: string; diffs: FieldDiff[] }
  | { kind: "CANCELLED"; row: ResolvedCsvRow; existingId: string; diffs: FieldDiff[] }
  | { kind: "POSSIBLE_DUPLICATE"; row: ResolvedCsvRow; candidates: ExistingReservationForMatch[] };

function sameCalendarDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function uniqueById(list: ExistingReservationForMatch[]): ExistingReservationForMatch[] {
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

function diffFields(row: ResolvedCsvRow, existing: ExistingReservationForMatch): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const check = (field: string, before: unknown, after: unknown) => {
    const b = before === null || before === undefined ? "" : String(before);
    const a = after === null || after === undefined ? "" : String(after);
    if (b !== a) diffs.push({ field, before: b, after: a });
  };
  check("customerName", existing.customerName, row.customerName);
  check("phone", existing.phone, row.phone);
  check("visitTime", existing.visitTime, row.visitTime);
  check("partySize", existing.partySize, row.partySize);
  check("status", existing.status, row.status);
  return diffs;
}

function diffOrUnchanged(row: ResolvedCsvRow, existing: ExistingReservationForMatch): ClassifiedRow {
  const diffs = diffFields(row, existing);
  if (diffs.length === 0) return { kind: "UNCHANGED", row, existingId: existing.id };
  const becameCancelled =
    existing.status !== "CANCELLED" && row.status === "CANCELLED";
  if (becameCancelled) return { kind: "CANCELLED", row, existingId: existing.id, diffs };
  return { kind: "UPDATED", row, existingId: existing.id, diffs };
}

/**
 * CSV1行を既存のReservationと照合し、NEW/UPDATED/CANCELLED/UNCHANGED/POSSIBLE_DUPLICATE/ERRORに分類する。
 * 一致度が高い場合(TableCheck予約IDの完全一致、または同一店舗・同一来店日での電話番号一致/氏名+人数一致)
 * のみ自動的にUPDATED/UNCHANGED扱いにし、それ以外の曖昧な一致はPOSSIBLE_DUPLICATEとして人間の判断に委ねる。
 */
export function classifyRow(
  row: ResolvedCsvRow,
  existing: ExistingReservationForMatch[]
): ClassifiedRow {
  if (!row.storeId) return { kind: "ERROR", row, reason: "店舗名がマッピングされていません" };
  if (!row.customerName) return { kind: "ERROR", row, reason: "氏名を取得できませんでした" };
  if (!row.visitDate) return { kind: "ERROR", row, reason: "来店日を取得できませんでした" };

  if (row.externalReservationId) {
    const match = existing.find((e) => e.externalReservationId === row.externalReservationId);
    if (match) return diffOrUnchanged(row, match);
  }

  const visitDate = row.visitDate;
  const scoped = existing.filter((e) => e.storeId === row.storeId && sameCalendarDate(e.visitDate, visitDate));
  const normPhone = normalizePhone(row.phone);
  const normName = normalizeName(row.customerName);

  const phoneMatches = normPhone ? scoped.filter((e) => normalizePhone(e.phone) === normPhone) : [];
  const nameMatches = normName ? scoped.filter((e) => normalizeName(e.customerName) === normName) : [];

  if (phoneMatches.length === 1) return diffOrUnchanged(row, phoneMatches[0]);
  if (!normPhone && nameMatches.length === 1 && nameMatches[0].partySize === row.partySize) {
    return diffOrUnchanged(row, nameMatches[0]);
  }

  const candidates = uniqueById([...phoneMatches, ...nameMatches]);
  if (candidates.length > 0) return { kind: "POSSIBLE_DUPLICATE", row, candidates };

  return { kind: "NEW", row };
}
