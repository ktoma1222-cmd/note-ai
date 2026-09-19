"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, getAdminSession, hasStoreAccess } from "@/lib/auth";
import { maskPhone } from "@/lib/format";
import {
  decodeCsvBytes,
  parseTableCheckCsv,
  type ParsedReservationRow,
} from "@/lib/integrations/tablecheck-csv";
import {
  classifyRow,
  type ClassifiedRow,
  type ExistingReservationForMatch,
  type ResolvedCsvRow,
} from "@/lib/reservation-matching";

async function requireImportRole() {
  const session = await getSession();
  if (!session || session.role === "STAFF") {
    throw new Error("この操作には管理者またはマネージャー権限が必要です。");
  }
  return session;
}

export type PreviewRowData = {
  externalReservationId: string | null;
  storeId: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  visitDate: string; // ISO
  visitTime: string | null;
  partySize: number | null;
  status: "CONFIRMED" | "REQUESTED" | "CANCELLED" | "UNKNOWN";
  country: string | null;
  purpose: string | null;
  isRepeat: boolean | null;
  reservationSource: string | null;
  estimatedAmount: number | null;
  tablecheckCreatedAt: string | null;
  tablecheckUpdatedAt: string | null;
  rawSourceData: string;
};

// previewTableCheckCsvAction がサーバー側のセッションに保持する内部表現(生データ含む、クライアントには渡さない)
type InternalPreviewRow = {
  rowId: number;
  kind: ClassifiedRow["kind"];
  reason?: string;
  existingId?: string;
  diffs?: { field: string; before: string; after: string }[];
  candidateIds?: string[];
  data: PreviewRowData | null; // ERROR(店舗未マッピング等)の場合はnull
  storeLabel: string;
  customerNameDisplay: string;
  phoneMasked: string;
};

// previewTableCheckCsvAction がクライアントに返す表示専用データ(電話番号・メール・生CSV行等のPIIは含めない)
export type PreviewRowDisplayData = {
  visitDate: string;
  visitTime: string | null;
  partySize: number | null;
};

export type PreviewRowResult = {
  rowId: number;
  kind: ClassifiedRow["kind"];
  reason?: string;
  diffs?: { field: string; before: string; after: string }[];
  candidates?: { id: string; customerName: string; phoneMasked: string; visitTime: string | null; partySize: number | null }[];
  data: PreviewRowDisplayData | null; // ERROR(店舗未マッピング等)の場合はnull。電話番号・メール・生データは含まない
  storeLabel: string;
  customerNameDisplay: string;
  phoneMasked: string;
};

export type PreviewSummary = {
  total: number;
  new: number;
  updated: number;
  cancelled: number;
  unchanged: number;
  duplicate: number;
  error: number;
};

export type PreviewResult =
  | {
      ok: true;
      sessionId: string;
      filename: string;
      summary: PreviewSummary;
      rows: PreviewRowResult[];
      unmappedStoreLabels: string[];
      unmatchedHeaders: string[];
    }
  | { ok: false; error: string };

const IMPORT_SESSION_TTL_MS = 30 * 60 * 1000; // 30分。プレビューしたが確認しないまま放置されたセッションの寿命

function toDisplayData(data: PreviewRowData | null): PreviewRowDisplayData | null {
  if (!data) return null;
  return { visitDate: data.visitDate, visitTime: data.visitTime, partySize: data.partySize };
}

function toRowData(row: ResolvedCsvRow): PreviewRowData | null {
  if (!row.storeId || !row.customerName || !row.visitDate) return null;
  return {
    externalReservationId: row.externalReservationId,
    storeId: row.storeId,
    customerName: row.customerName,
    phone: row.phone,
    email: row.email,
    visitDate: row.visitDate.toISOString(),
    visitTime: row.visitTime,
    partySize: row.partySize,
    status: row.status,
    country: row.country,
    purpose: row.purpose,
    isRepeat: row.isRepeat,
    reservationSource: row.reservationSource,
    estimatedAmount: row.estimatedAmount,
    tablecheckCreatedAt: row.tablecheckCreatedAt?.toISOString() ?? null,
    tablecheckUpdatedAt: row.tablecheckUpdatedAt?.toISOString() ?? null,
    rawSourceData: JSON.stringify(row.rawRow),
  };
}

export async function previewTableCheckCsvAction(formData: FormData): Promise<PreviewResult> {
  await requireImportRole();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "CSVファイルが選択されていません。" };
  }

  let parsed: ReturnType<typeof parseTableCheckCsv>;
  try {
    const bytes = await file.arrayBuffer();
    const text = decodeCsvBytes(bytes);
    parsed = parseTableCheckCsv(text);
  } catch (err) {
    return { ok: false, error: `CSVの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (parsed.rows.length === 0) {
    return { ok: false, error: "CSVから予約データを読み取れませんでした。列名を確認してください。" };
  }

  const distinctLabels = Array.from(
    new Set(parsed.rows.map((r) => r.storeRawLabel).filter((v): v is string => !!v))
  );

  for (const label of distinctLabels) {
    await prisma.tableCheckStoreMapping.upsert({
      where: { rawLabel: label },
      update: {},
      create: { rawLabel: label, storeId: null },
    });
  }

  if (distinctLabels.length > 0) {
    revalidatePath("/settings/tablecheck");
  }

  const mappings = await prisma.tableCheckStoreMapping.findMany({
    where: { rawLabel: { in: distinctLabels } },
  });
  const labelToStoreId = new Map(mappings.map((m) => [m.rawLabel, m.storeId]));
  const unmappedStoreLabels = distinctLabels.filter((l) => !labelToStoreId.get(l));

  const resolvedRows: ResolvedCsvRow[] = parsed.rows.map((r: ParsedReservationRow) => ({
    ...r,
    storeId: r.storeRawLabel ? labelToStoreId.get(r.storeRawLabel) ?? null : null,
  }));

  const relevantStoreIds = Array.from(
    new Set(resolvedRows.map((r) => r.storeId).filter((v): v is string => !!v))
  );
  const existingReservations = await prisma.reservation.findMany({
    where: relevantStoreIds.length > 0 ? { storeId: { in: relevantStoreIds } } : { id: "__none__" },
    select: {
      id: true,
      externalReservationId: true,
      storeId: true,
      customerName: true,
      phone: true,
      visitDate: true,
      visitTime: true,
      partySize: true,
      status: true,
    },
  });
  const existingForMatch: ExistingReservationForMatch[] = existingReservations;

  const storeIdToName = new Map(
    (await prisma.store.findMany({ where: { id: { in: relevantStoreIds } }, select: { id: true, name: true } })).map(
      (s) => [s.id, s.name]
    )
  );

  const summary: PreviewSummary = {
    total: resolvedRows.length,
    new: 0,
    updated: 0,
    cancelled: 0,
    unchanged: 0,
    duplicate: 0,
    error: 0,
  };

  const internalRows: InternalPreviewRow[] = resolvedRows.map((row, idx) => {
    const classified = classifyRow(row, existingForMatch);
    const storeLabel =
      (row.storeId && storeIdToName.get(row.storeId)) || row.storeRawLabel || "(不明)";
    const customerNameDisplay = row.customerName ?? "(氏名不明)";
    const phoneMasked = maskPhone(row.phone);

    switch (classified.kind) {
      case "ERROR":
        summary.error++;
        return { rowId: idx, kind: "ERROR", reason: classified.reason, data: null, storeLabel, customerNameDisplay, phoneMasked };
      case "NEW":
        summary.new++;
        return { rowId: idx, kind: "NEW", data: toRowData(row), storeLabel, customerNameDisplay, phoneMasked };
      case "UNCHANGED":
        summary.unchanged++;
        return {
          rowId: idx,
          kind: "UNCHANGED",
          existingId: classified.existingId,
          data: toRowData(row),
          storeLabel,
          customerNameDisplay,
          phoneMasked,
        };
      case "UPDATED":
        summary.updated++;
        return {
          rowId: idx,
          kind: "UPDATED",
          existingId: classified.existingId,
          diffs: classified.diffs,
          data: toRowData(row),
          storeLabel,
          customerNameDisplay,
          phoneMasked,
        };
      case "CANCELLED":
        summary.cancelled++;
        return {
          rowId: idx,
          kind: "CANCELLED",
          existingId: classified.existingId,
          diffs: classified.diffs,
          data: toRowData(row),
          storeLabel,
          customerNameDisplay,
          phoneMasked,
        };
      case "POSSIBLE_DUPLICATE":
        summary.duplicate++;
        return {
          rowId: idx,
          kind: "POSSIBLE_DUPLICATE",
          candidateIds: classified.candidates.map((c) => c.id),
          data: toRowData(row),
          storeLabel,
          customerNameDisplay,
          phoneMasked,
          // 表示用の候補一覧(マスク済み)はクライアント返却用オブジェクトの方に別途持たせる
          _displayCandidates: classified.candidates.map((c) => ({
            id: c.id,
            customerName: c.customerName,
            phoneMasked: maskPhone(c.phone),
            visitTime: c.visitTime,
            partySize: c.partySize,
          })),
        } as InternalPreviewRow & { _displayCandidates: NonNullable<PreviewRowResult["candidates"]> };
    }
  });

  // 放置された古いセッションを掃除してからサーバー側に保存する。
  // confirm時に信頼できるのはこのセッションに保存された値のみで、クライアントから届く値は一切信用しない
  // (セキュリティ監査finding: tablecheck-confirm-trusts-client-payload / tablecheck-preview-bulk-pii-to-client)。
  await prisma.tableCheckImportSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const session = await prisma.tableCheckImportSession.create({
    data: {
      filename: file.name,
      expiresAt: new Date(Date.now() + IMPORT_SESSION_TTL_MS),
      rowsJson: JSON.stringify(internalRows),
    },
  });

  const rows: PreviewRowResult[] = internalRows.map((row) => {
    const displayCandidates = (row as InternalPreviewRow & { _displayCandidates?: PreviewRowResult["candidates"] })
      ._displayCandidates;
    return {
      rowId: row.rowId,
      kind: row.kind,
      reason: row.reason,
      diffs: row.diffs,
      candidates: displayCandidates,
      data: toDisplayData(row.data),
      storeLabel: row.storeLabel,
      customerNameDisplay: row.customerNameDisplay,
      phoneMasked: row.phoneMasked,
    };
  });

  return {
    ok: true,
    sessionId: session.id,
    filename: file.name,
    summary,
    rows,
    unmappedStoreLabels,
    unmatchedHeaders: parsed.unmatchedHeaders,
  };
}

// POSSIBLE_DUPLICATE行についてのみ、人間の判断(新規登録 or 既存予約への統合)をクライアントから受け取る。
// それ以外のフィールド(氏名・電話・金額・店舗等)は一切クライアントから受け取らず、
// previewTableCheckCsvAction がサーバー側に保存した値のみを使う
// (セキュリティ監査finding: tablecheck-confirm-trusts-client-payload)。
export type DuplicateResolution = { rowId: number; choice: "NEW" | "MERGE"; mergeExistingId?: string };

export type ConfirmImportPayload = {
  sessionId: string;
  resolutions: DuplicateResolution[];
};

export type ConfirmImportResult =
  | { ok: true; created: number; updated: number; skipped: number; errors: number }
  | { ok: false; error: string };

export async function confirmTableCheckCsvImportAction(
  payload: ConfirmImportPayload
): Promise<ConfirmImportResult> {
  const session = await requireImportRole();

  const importSession = await prisma.tableCheckImportSession.findUnique({ where: { id: payload.sessionId } });
  if (!importSession || importSession.expiresAt.getTime() < Date.now()) {
    if (importSession) await prisma.tableCheckImportSession.delete({ where: { id: importSession.id } }).catch(() => {});
    return { ok: false, error: "プレビューの有効期限が切れました。もう一度CSVをアップロードし直してください。" };
  }

  const internalRows: InternalPreviewRow[] = JSON.parse(importSession.rowsJson);
  const resolutionByRowId = new Map(payload.resolutions.map((r) => [r.rowId, r]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of internalRows) {
    if (row.kind === "ERROR" || row.kind === "UNCHANGED" || !row.data) {
      skipped++;
      continue;
    }

    // MANAGERはStoreAccessで許可された店舗の予約のみ取り込める
    // (セキュリティ監査finding: storeaccess-not-enforced)。
    if (!(await hasStoreAccess(session, row.data.storeId))) {
      errors.push(`行${row.rowId}: この店舗(${row.storeLabel})を取り込む権限がありません`);
      continue;
    }

    const writeData = {
      externalReservationId: row.data.externalReservationId,
      storeId: row.data.storeId,
      customerName: row.data.customerName,
      phone: row.data.phone,
      email: row.data.email,
      visitDate: new Date(row.data.visitDate),
      visitTime: row.data.visitTime,
      partySize: row.data.partySize,
      status: row.data.status,
      country: row.data.country,
      purpose: row.data.purpose,
      isRepeat: row.data.isRepeat,
      reservationSource: row.data.reservationSource || "TableCheck",
      estimatedAmount: row.data.estimatedAmount,
      rawSourceData: row.data.rawSourceData,
      tablecheckCreatedAt: row.data.tablecheckCreatedAt ? new Date(row.data.tablecheckCreatedAt) : null,
      tablecheckUpdatedAt: row.data.tablecheckUpdatedAt ? new Date(row.data.tablecheckUpdatedAt) : null,
    };

    try {
      if (row.kind === "UPDATED" || row.kind === "CANCELLED") {
        if (!row.existingId) throw new Error("existingId is missing for an UPDATED/CANCELLED row");
        await prisma.reservation.update({ where: { id: row.existingId }, data: writeData });
        updated++;
      } else if (row.kind === "NEW") {
        await prisma.reservation.create({ data: writeData });
        created++;
      } else if (row.kind === "POSSIBLE_DUPLICATE") {
        const resolution = resolutionByRowId.get(row.rowId);
        if (!resolution) {
          skipped++;
          continue;
        }
        if (resolution.choice === "NEW") {
          await prisma.reservation.create({ data: writeData });
          created++;
        } else if (resolution.choice === "MERGE") {
          const candidateIds = row.candidateIds ?? [];
          if (!resolution.mergeExistingId || !candidateIds.includes(resolution.mergeExistingId)) {
            // previewが提示した候補一覧に無いIDへの統合は拒否する(クライアントからの任意ID指定を許さない)
            errors.push(`行${row.rowId}: 統合先の予約IDがプレビュー時の候補と一致しません`);
            continue;
          }
          await prisma.reservation.update({ where: { id: resolution.mergeExistingId }, data: writeData });
          updated++;
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await prisma.reservationImportLog.create({
    data: {
      filename: importSession.filename,
      importedBy: session.userId,
      totalCount: internalRows.length,
      newCount: internalRows.filter((r) => r.kind === "NEW").length,
      updatedCount: internalRows.filter((r) => r.kind === "UPDATED").length,
      cancelledCount: internalRows.filter((r) => r.kind === "CANCELLED").length,
      unchangedCount: internalRows.filter((r) => r.kind === "UNCHANGED").length,
      duplicateCount: internalRows.filter((r) => r.kind === "POSSIBLE_DUPLICATE").length,
      errorCount: internalRows.filter((r) => r.kind === "ERROR").length + errors.length,
      errorDetail: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "TABLECHECK_CSV_IMPORT",
      targetType: "Reservation",
      detail: JSON.stringify({ created, updated, skipped, errors: errors.length }),
    },
  });

  await prisma.tableCheckImportSession.delete({ where: { id: importSession.id } }).catch(() => {});

  revalidatePath("/settings/tablecheck");

  return { ok: true, created, updated, skipped, errors: errors.length };
}

export async function updateTableCheckStoreMappingAction(rawLabel: string, storeId: string | null) {
  // CSV上の店舗名がどのNOTE AI店舗に対応するかという全店舗共通の設定であり、
  // 一部店舗のみを担当するMANAGERに変更させると他店舗の取込先を書き換えられてしまうため、
  // ADMIN限定にする(セキュリティ監査finding: storeaccess-not-enforced)。
  const session = await getAdminSession();
  if (!session) throw new Error("この操作には管理者権限が必要です。");
  await prisma.tableCheckStoreMapping.update({ where: { rawLabel }, data: { storeId } });
  revalidatePath("/settings/tablecheck");
}
