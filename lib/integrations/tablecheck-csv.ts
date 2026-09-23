import "server-only";

// TableCheck CSVエクスポートを取り込むためのパーサー。
// TableCheck APIは利用できない(申請却下)ため、CSVエクスポート→手動アップロードの経路のみをサポートする。
// 実際のCSVサンプルが手元にない状態で実装しているため、列名・ステータス値の候補リストは
// 一般的な想定に基づく仮のものであり(lib/integrations/pl-sheet-mapping.tsと同じ「候補リストを順に試す」設計)、
// 実データが手に入り次第、候補の追加・優先順位の見直しが必要になる可能性が高い。

/** 生CSVのバイト列を文字列にデコードする。UTF-8で読み、文字化けを検知したらShift_JISで再デコードする。 */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("�")) {
    // UTF-8 BOMを除去
    return utf8.startsWith("﻿") ? utf8.slice(1) : utf8;
  }
  try {
    return new TextDecoder("shift_jis").decode(bytes);
  } catch {
    return utf8;
  }
}

/** RFC4180準拠の簡易CSVパーサー(引用符・カンマ内包・改行コード混在に対応)。依存追加はしない方針のため自前実装。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      pushField();
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") continue; // \r\nの\rはスキップし\nで改行処理
      pushRow();
      continue;
    }
    if (c === "\n") {
      pushRow();
      continue;
    }
    field += c;
  }
  // 末尾に改行がない最終行を回収
  if (field !== "" || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

// ヘッダー名の表記ゆれ候補(小文字化・trim済みで比較する)。
// TableCheck実CSV(2026-09-17に実データで検証)では「予約ID」=6桁の英数字コード、
// 「人数」は年齢区分別(人数:大人/シニア/子供/幼児)に4列へ分かれている、
// 開始日時は「開始日」+「開始時刻」の分割列(または「予約時間」の結合列)、
// 「きっかけ」列はTableCheck側のシステム分類でしかなく実態と乖離するため、予約経路
// (reservationSource)は予約メモ内のお客様自身の回答(「当店をお知りになったきっかけ」Q&A)を
// 優先し、「きっかけ」列は該当質問が無い古いCSVのみのフォールバックとする(2026-09-23判明)。
// 国籍・リピート情報も同様に独立列ではなく「予約メモ」内の自由記述(Q&A形式)に埋め込まれている。
const HEADER_CANDIDATES = {
  externalReservationId: [
    "reservation_id",
    "reservationid",
    "booking_id",
    "bookingid",
    "booking_reference",
    "reservation_no",
    "reservation_number",
    "予約id",
    "予約番号",
    "予約id番号",
  ],
  storeLabel: ["store", "restaurant", "venue", "shop", "店舗", "店舗名"],
  customerName: [
    "name",
    "customer_name",
    "guest_name",
    "guest",
    "お名前",
    "氏名",
    "顧客名",
    "代表者名",
    "名前",
  ],
  phone: ["phone", "telephone", "customer_phone", "mobile", "tel", "電話番号", "電話"],
  email: ["email", "e-mail", "mail", "メールアドレス", "eメール"],
  visitDate: [
    "date",
    "visit_date",
    "reservation_date",
    "booking_date",
    "来店日",
    "予約日",
    "ご来店日",
    "開始日",
  ],
  visitTime: [
    "time",
    "visit_time",
    "reservation_time",
    "booking_time",
    "来店時間",
    "予約時間",
    "開始時刻",
  ],
  visitDateTime: [
    "datetime",
    "visit_datetime",
    "reservation_datetime",
    "予約日時",
    "来店日時",
  ],
  partySize: ["party_size", "covers", "guests", "persons", "pax", "人数", "来店人数"],
  status: ["status", "reservation_status", "ステータス", "予約ステータス", "状態"],
  country: ["country", "nationality", "国籍", "国"],
  purpose: ["purpose", "occasion", "用途", "ご利用目的"],
  isRepeat: ["repeat", "is_repeat", "returning", "リピート", "新規リピート", "ご利用回数"],
  createdAt: ["created_at", "created", "reservation_created_at", "予約作成日時", "登録日時", "作成日"],
  updatedAt: ["updated_at", "updated", "reservation_updated_at", "更新日時", "更新日"],
  reservationSource: ["reservation_source", "booking_source", "予約経路", "きっかけ"],
  notes: ["notes", "memo", "備考", "予約メモ"],
  estimatedAmount: ["注文合計金額", "合計金額", "order_total", "order_total_amount"],
} as const;

// TableCheckの実CSVは人数を年齢区分別に複数列(人数:大人/シニア/子供/幼児)へ分けて出力する。
// これらが見つかった場合は合算してpartySizeとする(見つからなければ単一のpartySize候補列にフォールバック)。
const PARTY_SIZE_SUM_CANDIDATES = ["人数:大人", "人数:シニア", "人数:子供", "人数:幼児"];

type FieldKey = keyof typeof HEADER_CANDIDATES;

const STATUS_VALUE_CANDIDATES: { status: "CONFIRMED" | "REQUESTED" | "CANCELLED"; labels: string[] }[] = [
  {
    status: "CONFIRMED",
    labels: [
      "confirmed",
      "confirm",
      "確定",
      "確認",
      "予約確定",
      "承認済み",
      "承認",
      "お会計済み",
      "ご案内済み",
      "確認済み",
    ],
  },
  {
    status: "CANCELLED",
    labels: [
      "cancelled",
      "canceled",
      "cancel",
      "キャンセル",
      "取消",
      "取消済み",
      "キャンセル済み",
      "削除済み",
    ],
  },
  {
    status: "REQUESTED",
    labels: [
      "requested",
      "request",
      "pending",
      "リクエスト",
      "未確定",
      "仮予約",
      "申請中",
      "順番待ち",
    ],
  },
];

/**
 * 「予約メモ」内の自由記述(Q&A形式)から国籍・リピート区分・来店のきっかけを抽出する。
 * TableCheck実データでは独立列ではなく「質問N: Country of cit… 回答N: United States」
 * 「ご利用回数: 初来店」「質問N: 差し支えなければ、当店をお知… 回答N: Google, 紹介・オススメ」
 * のような形式でメモ欄に埋め込まれているため、正規表現で拾う(2026-09-23、実CSVで確認。
 * 質問文はCSV上で「…」により途中で切り詰められているため、生き残る先頭部分のみで照合する)。
 * 抽出できるのはあくまで補助的な情報であり、書式が変われば拾えなくなる点に注意。
 */
export function extractFromNotes(notes: string | null): {
  country: string | null;
  isRepeat: boolean | null;
  discoverySource: string | null;
} {
  if (!notes) return { country: null, isRepeat: null, discoverySource: null };

  function extractAnswer(line: string): string | null {
    const m = line.match(/回答\s*\d*[:：]\s*(.+)$/);
    return m ? m[1].trim() : null;
  }

  let country: string | null = null;
  let discoverySource: string | null = null;
  for (const line of notes.split(/\r?\n/)) {
    if (country === null && /country of cit|国籍/i.test(line)) {
      country = extractAnswer(line);
    }
    // 「当店をお知りになったきっかけをお知らせください」という予約フォームの自由回答質問
    // (お客様自身が回答した来店経路。TableCheck側がシステム的に分類する「きっかけ」列とは別物で、
    // 現場ではこちらの方が実態に近いとされる。複数選択可のためカンマ区切りの複数値が入りうる)。
    if (discoverySource === null && /当店をお知/.test(line)) {
      discoverySource = extractAnswer(line);
    }
  }

  let isRepeat: boolean | null = null;
  if (/ご利用回数\s*[:：]\s*リピート/.test(notes)) isRepeat = true;
  else if (/ご利用回数\s*[:：]\s*初来店/.test(notes)) isRepeat = false;

  return { country, isRepeat, discoverySource };
}

export function mapCsvStatus(raw: string | null): "CONFIRMED" | "REQUESTED" | "CANCELLED" | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  const normalized = raw.trim().toLowerCase();
  for (const candidate of STATUS_VALUE_CANDIDATES) {
    if (candidate.labels.some((l) => l.toLowerCase() === normalized)) return candidate.status;
  }
  return "UNKNOWN";
}

/** ヘッダー行から各フィールドの列インデックスを解決する。見つからなければundefined。 */
export function resolveHeaderMapping(header: string[]): Record<FieldKey, number | undefined> {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const result = {} as Record<FieldKey, number | undefined>;
  for (const key of Object.keys(HEADER_CANDIDATES) as FieldKey[]) {
    const candidates = HEADER_CANDIDATES[key];
    const idx = normalized.findIndex((h) => (candidates as readonly string[]).includes(h));
    result[key] = idx === -1 ? undefined : idx;
  }
  return result;
}

function get(row: string[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = row[idx];
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** "YYYY-MM-DD"/"YYYY/MM/DD"/"MM/DD/YYYY"等、よくある区切りの日付表記を解決する(依存追加せず自前実装)。 */
export function parseFlexibleDate(raw: string | null): Date | null {
  if (!raw) return null;
  const isoLike = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoLike) {
    const [, y, m, d] = isoLike;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const usLike = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usLike) {
    const [, m, d, y] = usLike;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "18:30" 等の時刻表記を抽出する。日時が結合されたカラムからも抽出できるようにする。 */
export function extractTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export type ParsedReservationRow = {
  rowNumber: number; // 1始まり(ヘッダーを除く)
  externalReservationId: string | null;
  storeRawLabel: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  visitDate: Date | null;
  visitTime: string | null;
  partySize: number | null;
  status: "CONFIRMED" | "REQUESTED" | "CANCELLED" | "UNKNOWN";
  country: string | null;
  purpose: string | null;
  isRepeat: boolean | null;
  reservationSource: string | null;
  estimatedAmount: number | null;
  tablecheckCreatedAt: Date | null;
  tablecheckUpdatedAt: Date | null;
  rawRow: Record<string, string>;
};

export type CsvParseResult = {
  rows: ParsedReservationRow[];
  unmatchedHeaders: string[];
  header: string[];
};

export function parseTableCheckCsv(text: string): CsvParseResult {
  let table = parseCsv(text);
  if (table.length === 0) return { rows: [], unmatchedHeaders: [], header: [] };

  // TableCheckの実エクスポートは、本来のヘッダー行の前に単一セルのタイトル行(例: "予約")が
  // 付くことがある。先頭行が明らかに列数の少ない見出し行の場合はスキップする。
  while (table.length > 1 && table[0].length === 1 && table[1].length > table[0].length) {
    table = table.slice(1);
  }

  const header = table[0];
  const normalizedHeader = header.map((h) => h.trim().toLowerCase());
  const mapping = resolveHeaderMapping(header);
  const matchedIndexes = new Set(Object.values(mapping).filter((v): v is number => v !== undefined));
  const partySizeSumIndexes = PARTY_SIZE_SUM_CANDIDATES.map((label) =>
    normalizedHeader.indexOf(label.toLowerCase())
  ).filter((idx) => idx !== -1);
  partySizeSumIndexes.forEach((idx) => matchedIndexes.add(idx));
  const unmatchedHeaders = header.filter((_, i) => !matchedIndexes.has(i));

  const rows: ParsedReservationRow[] = table.slice(1).map((row, i) => {
    const rawRow: Record<string, string> = {};
    header.forEach((h, idx) => {
      if (row[idx] !== undefined) rawRow[h] = row[idx];
    });

    const visitDateRaw = get(row, mapping.visitDate) ?? get(row, mapping.visitDateTime);
    const visitTimeRaw = get(row, mapping.visitTime) ?? get(row, mapping.visitDateTime);
    const isRepeatRaw = get(row, mapping.isRepeat);
    const notesRaw = get(row, mapping.notes);
    const fromNotes = extractFromNotes(notesRaw);

    let partySize: number | null = null;
    if (partySizeSumIndexes.length > 0) {
      const sum = partySizeSumIndexes.reduce((acc, idx) => acc + (Number.parseInt(row[idx] ?? "0", 10) || 0), 0);
      partySize = sum > 0 ? sum : null;
    } else {
      const partySizeRaw = get(row, mapping.partySize);
      partySize = partySizeRaw ? Number.parseInt(partySizeRaw, 10) || null : null;
    }

    return {
      rowNumber: i + 1,
      externalReservationId: get(row, mapping.externalReservationId),
      storeRawLabel: get(row, mapping.storeLabel),
      customerName: get(row, mapping.customerName),
      phone: get(row, mapping.phone),
      email: get(row, mapping.email),
      visitDate: parseFlexibleDate(visitDateRaw),
      visitTime: extractTime(visitTimeRaw),
      partySize,
      status: mapCsvStatus(get(row, mapping.status)),
      // 国籍・予約経路とも、お客様自身の回答(予約メモ内のQ&A)がある場合はそちらを優先する。
      // 「きっかけ」等の独立列はTableCheck側のシステム分類でしかなく、実態と乖離することが
      // 確認された(2026-09-23、ユーザー確認)ため、独立列は該当するメモが無い場合のみのフォールバックとする。
      country: fromNotes.country ?? get(row, mapping.country),
      purpose: get(row, mapping.purpose),
      isRepeat: isRepeatRaw ? /リピ|repeat|returning/i.test(isRepeatRaw) : fromNotes.isRepeat,
      reservationSource: fromNotes.discoverySource ?? get(row, mapping.reservationSource),
      estimatedAmount: (() => {
        const raw = get(row, mapping.estimatedAmount);
        if (!raw) return null;
        const n = Number.parseFloat(raw);
        return Number.isFinite(n) ? n : null;
      })(),
      tablecheckCreatedAt: parseFlexibleDate(get(row, mapping.createdAt)),
      tablecheckUpdatedAt: parseFlexibleDate(get(row, mapping.updatedAt)),
      rawRow,
    };
  });

  return { rows, unmatchedHeaders, header };
}

/** 電話番号を数字のみに正規化する(既存Notion同期のdedupロジックと同じ考え方)。 */
export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits || null;
}

export function normalizeName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/\s+/g, "");
}
