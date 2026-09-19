import "server-only";
import type { NotionPage, NotionPropertyValue } from "@/lib/integrations/notion";
import type { ReservationStatus } from "@prisma/client";

// --- 書き込み方向(NOTE AI → Notion)のプロパティシリアライザ ---
// formula/created_time型は書き込み不可(地域/国名（整理）/用途（分類）/登録日時)なので対象外。

function toTitle(text: string) {
  return { title: text ? [{ text: { content: text } }] : [] };
}

function toRichText(text: string | null | undefined) {
  return { rich_text: text ? [{ text: { content: text } }] : [] };
}

function toEmail(value: string | null | undefined) {
  return { email: value || null };
}

function toPhoneNumber(value: string | null | undefined) {
  return { phone_number: value || null };
}

function toNumber(value: number | null | undefined) {
  return { number: value ?? null };
}

function toSelect(name: string | null | undefined) {
  return { select: name ? { name } : null };
}

function toDate(isoStart: string | null | undefined) {
  return { date: isoStart ? { start: isoStart } : null };
}

const STATUS_TO_NOTION_LABEL: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: "確認",
  REQUESTED: "リクエスト",
  CANCELLED: "キャンセル",
  // UNKNOWNは対応する選択肢が無いため書き込み対象外(呼び出し側でプロパティ自体を省く)
};

export type ReservationForNotion = {
  externalReservationId: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  visitDateTimeIso: string | null; // 来店日+時刻を結合済みのISO文字列
  partySize: number | null;
  status: ReservationStatus;
  isRepeat: boolean | null;
  purpose: string | null;
  country: string | null;
  reservationSource: string | null;
};

/** Reservationのフィールドを、Notion Pages APIのproperties形式へ変換する。 */
export function buildReservationNotionProperties(
  reservation: ReservationForNotion,
  storeNotionLabel: string
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    お名前: toTitle(reservation.customerName),
    電話番号: toPhoneNumber(reservation.phone),
    Eメール: toEmail(reservation.email),
    店舗名: toSelect(storeNotionLabel),
    予約日時: toDate(reservation.visitDateTimeIso),
    人数: toNumber(reservation.partySize),
    予約ID: toRichText(reservation.externalReservationId),
  };

  const statusLabel = STATUS_TO_NOTION_LABEL[reservation.status];
  if (statusLabel) properties["ステータス"] = toSelect(statusLabel);

  if (reservation.isRepeat !== null) {
    properties["ご利用回数"] = toSelect(reservation.isRepeat ? "リピート" : "初来店");
  }
  if (reservation.purpose) properties["用途"] = toSelect(reservation.purpose);
  if (reservation.country) properties["国籍"] = toRichText(reservation.country);
  if (reservation.reservationSource) properties["予約経路"] = toRichText(reservation.reservationSource);

  return properties;
}

/** ページの「予約ID」(rich_text)プロパティの値を読む。同期時の突合キーに使う。 */
export function getReservationIdFromPage(page: NotionPage): string | null {
  return getRichText(page.properties["予約ID"]);
}

function getTitle(prop?: NotionPropertyValue): string {
  if (!prop || prop.type !== "title") return "";
  return (prop as { title: { plain_text: string }[] }).title
    .map((t) => t.plain_text)
    .join("");
}

function getRichText(prop?: NotionPropertyValue): string | null {
  if (!prop || prop.type !== "rich_text") return null;
  const text = (prop as { rich_text: { plain_text: string }[] }).rich_text
    .map((t) => t.plain_text)
    .join("");
  return text || null;
}

function getEmail(prop?: NotionPropertyValue): string | null {
  if (!prop || prop.type !== "email") return null;
  return (prop as { email: string | null }).email;
}

function getPhone(prop?: NotionPropertyValue): string | null {
  if (!prop || prop.type !== "phone_number") return null;
  return (prop as { phone_number: string | null }).phone_number;
}

function getNumber(prop?: NotionPropertyValue): number | null {
  if (!prop || prop.type !== "number") return null;
  return (prop as { number: number | null }).number;
}

function getSelect(prop?: NotionPropertyValue): string | null {
  if (!prop || prop.type !== "select") return null;
  return (prop as { select: { name: string } | null }).select?.name ?? null;
}

function getDate(prop?: NotionPropertyValue): string | null {
  if (!prop || prop.type !== "date") return null;
  return (prop as { date: { start: string } | null }).date?.start ?? null;
}

function getCreatedTime(prop?: NotionPropertyValue): string | null {
  if (!prop || prop.type !== "created_time") return null;
  return (prop as { created_time: string }).created_time;
}

function getFormulaString(prop?: NotionPropertyValue): string | null {
  if (!prop || prop.type !== "formula") return null;
  const formula = (
    prop as {
      formula: { type: string; string?: string | null };
    }
  ).formula;
  if (formula.type !== "string") return null;
  return formula.string || null;
}

const STATUS_MAP: Record<string, ReservationStatus> = {
  確認: "CONFIRMED",
  リクエスト: "REQUESTED",
  キャンセル: "CANCELLED",
};

export type NormalizedVisit = {
  notionPageId: string;
  name: string;
  phone: string | null;
  email: string | null;
  storeLabel: string | null;
  visitDateTime: string | null; // ISO(予約日時。無ければ登録日時にフォールバック)
  partySize: number | null;
  status: ReservationStatus;
  isNewVisit: boolean;
  countryRaw: string | null;
  country: string | null;
  region: string | null;
  purpose: string | null;
  purposeCategory: string | null;
  notes: string | null;
  orderNotes: string | null;
};

export function normalizeNotionPage(page: NotionPage): NormalizedVisit {
  const p = page.properties;
  const statusLabel = getSelect(p["ステータス"]) ?? "";
  const usageLabel = getSelect(p["ご利用回数"]);

  return {
    notionPageId: page.id,
    name: getTitle(p["お名前"]) || "(名称未設定)",
    phone: getPhone(p["電話番号"]),
    email: getEmail(p["Eメール"]),
    storeLabel: getSelect(p["店舗名"]),
    visitDateTime: getDate(p["予約日時"]) ?? getCreatedTime(p["登録日時"]),
    partySize: getNumber(p["人数"]),
    status: STATUS_MAP[statusLabel] ?? "REQUESTED",
    isNewVisit: usageLabel === "初来店",
    countryRaw: getRichText(p["国籍"]),
    country: getFormulaString(p["国名（整理）"]),
    region: getFormulaString(p["地域"]),
    purpose: getSelect(p["用途"]),
    purposeCategory: getFormulaString(p["用途（分類）"]),
    notes: getRichText(p["アレルギー・備考"]),
    orderNotes: getRichText(p["ご注文"]),
  };
}
