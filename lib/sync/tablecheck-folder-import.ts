import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { decodeCsvBytes, parseTableCheckCsv } from "@/lib/integrations/tablecheck-csv";
import {
  classifyRow,
  type ExistingReservationForMatch,
  type ResolvedCsvRow,
} from "@/lib/reservation-matching";

// TableCheckはCSVエクスポートAPIを提供していない(手動ダウンロードのみ)ため、
// 完全自動化はできない。代わりに「手動ダウンロードしたCSVを指定フォルダに置くだけ」の
// 半自動化とする: incoming/に置かれたCSVを定期ジョブ(/api/cron/tablecheck-import)が
// 拾い上げ、確実に自動判定できる行(NEW/UPDATED/CANCELLED/UNCHANGED)のみ自動でReservationに
// 反映する。重複の疑いがある行・エラー行は書き込まず、ファイルごとneeds-review/に残す
// (誤った統合や重複登録を防ぐため、人間の判断が要る行は既存の手動アップロードUI
// (previewTableCheckCsvAction/confirmTableCheckCsvImportAction)に委ねる設計)。
// TableCheckログイン自動化(ブラウザ操作でのCSV取得)は、認証情報の保管リスク・利用規約上の
// リスク・UI変更への脆弱性を理由に採用しない(2026-09-23、ユーザー判断)。

const INBOX_DIR = process.env.TABLECHECK_INBOX_DIR
  ? path.resolve(process.env.TABLECHECK_INBOX_DIR)
  : path.join(process.cwd(), "tablecheck-inbox");
const INCOMING_DIR = path.join(INBOX_DIR, "incoming");
const PROCESSED_DIR = path.join(INBOX_DIR, "processed");
const NEEDS_REVIEW_DIR = path.join(INBOX_DIR, "needs-review");

async function ensureDirs() {
  await fs.mkdir(INCOMING_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
  await fs.mkdir(NEEDS_REVIEW_DIR, { recursive: true });
}

function timestamped(filename: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${filename}`;
}

async function moveFile(from: string, toDir: string, filename: string) {
  await fs.rename(from, path.join(toDir, timestamped(filename)));
}

function toWriteData(row: ResolvedCsvRow) {
  return {
    externalReservationId: row.externalReservationId,
    storeId: row.storeId as string,
    customerName: row.customerName as string,
    phone: row.phone,
    email: row.email,
    visitDate: row.visitDate as Date,
    visitTime: row.visitTime,
    partySize: row.partySize,
    status: row.status,
    country: row.country,
    purpose: row.purpose,
    isRepeat: row.isRepeat,
    reservationSource: row.reservationSource || "TableCheck",
    estimatedAmount: row.estimatedAmount,
    rawSourceData: JSON.stringify(row.rawRow),
    tablecheckCreatedAt: row.tablecheckCreatedAt,
    tablecheckUpdatedAt: row.tablecheckUpdatedAt,
  };
}

export type TablecheckFolderImportFileResult = {
  filename: string;
  total: number;
  newCount: number;
  updatedCount: number;
  cancelledCount: number;
  unchangedCount: number;
  duplicateCount: number;
  errorCount: number;
  movedTo: "processed" | "needs-review";
};

export type TablecheckFolderImportResult = {
  filesFound: number;
  files: TablecheckFolderImportFileResult[];
  errors: string[];
};

async function processFile(filename: string): Promise<TablecheckFolderImportFileResult> {
  const filePath = path.join(INCOMING_DIR, filename);
  const bytes = await fs.readFile(filePath);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const text = decodeCsvBytes(arrayBuffer);
  const parsed = parseTableCheckCsv(text);

  if (parsed.rows.length === 0) {
    await moveFile(filePath, NEEDS_REVIEW_DIR, filename);
    return {
      filename,
      total: 0,
      newCount: 0,
      updatedCount: 0,
      cancelledCount: 0,
      unchangedCount: 0,
      duplicateCount: 0,
      errorCount: 1,
      movedTo: "needs-review",
    };
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
  const mappings = await prisma.tableCheckStoreMapping.findMany({ where: { rawLabel: { in: distinctLabels } } });
  const labelToStoreId = new Map(mappings.map((m) => [m.rawLabel, m.storeId]));

  const resolvedRows: ResolvedCsvRow[] = parsed.rows.map((r) => ({
    ...r,
    storeId: r.storeRawLabel ? labelToStoreId.get(r.storeRawLabel) ?? null : null,
  }));

  const relevantStoreIds = Array.from(new Set(resolvedRows.map((r) => r.storeId).filter((v): v is string => !!v)));
  const existing = await prisma.reservation.findMany({
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
  const existingForMatch: ExistingReservationForMatch[] = existing;

  const counts = {
    newCount: 0,
    updatedCount: 0,
    cancelledCount: 0,
    unchangedCount: 0,
    duplicateCount: 0,
    errorCount: 0,
  };
  const errors: string[] = [];

  for (const row of resolvedRows) {
    const classified = classifyRow(row, existingForMatch);
    try {
      switch (classified.kind) {
        case "ERROR":
          counts.errorCount++;
          break;
        case "POSSIBLE_DUPLICATE":
          // 重複の疑いがある行は自動で新規登録/統合を判断せず、人間の確認(既存の手動アップロードUI)に委ねる。
          counts.duplicateCount++;
          break;
        case "NEW":
          await prisma.reservation.create({ data: toWriteData(row) });
          counts.newCount++;
          break;
        case "UNCHANGED":
          counts.unchangedCount++;
          break;
        case "UPDATED":
          await prisma.reservation.update({ where: { id: classified.existingId }, data: toWriteData(row) });
          counts.updatedCount++;
          break;
        case "CANCELLED":
          await prisma.reservation.update({ where: { id: classified.existingId }, data: toWriteData(row) });
          counts.cancelledCount++;
          break;
      }
    } catch (err) {
      counts.errorCount++;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const needsReview = counts.duplicateCount > 0 || counts.errorCount > 0;

  await prisma.reservationImportLog.create({
    data: {
      filename: `[自動取込] ${filename}`,
      importedBy: null,
      totalCount: resolvedRows.length,
      newCount: counts.newCount,
      updatedCount: counts.updatedCount,
      cancelledCount: counts.cancelledCount,
      unchangedCount: counts.unchangedCount,
      duplicateCount: counts.duplicateCount,
      errorCount: counts.errorCount,
      errorDetail: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "TABLECHECK_CSV_AUTO_IMPORT",
      targetType: "Reservation",
      detail: JSON.stringify({ filename, ...counts }),
    },
  });

  await moveFile(filePath, needsReview ? NEEDS_REVIEW_DIR : PROCESSED_DIR, filename);

  return {
    filename,
    total: resolvedRows.length,
    ...counts,
    movedTo: needsReview ? "needs-review" : "processed",
  };
}

/**
 * incoming/ フォルダにあるCSVを取り込む。手動ダウンロードしたCSVをこのフォルダに置くだけで、
 * 確実に自動判定できる行は自動でReservationに反映され、重複の疑いがある行・エラー行だけが
 * needs-review/ に残る(そちらは設定画面の手動アップロードUIで再確認できる)。
 */
export async function runTablecheckFolderImport(): Promise<TablecheckFolderImportResult> {
  await ensureDirs();
  const entries = await fs.readdir(INCOMING_DIR, { withFileTypes: true });
  const csvFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".csv"))
    .map((e) => e.name)
    .sort();

  const result: TablecheckFolderImportResult = { filesFound: csvFiles.length, files: [], errors: [] };

  for (const filename of csvFiles) {
    try {
      result.files.push(await processFile(filename));
    } catch (err) {
      result.errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

export async function listNeedsReviewFiles(): Promise<string[]> {
  await ensureDirs();
  const entries = await fs.readdir(NEEDS_REVIEW_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".csv"))
    .map((e) => e.name)
    .sort()
    .reverse();
}

export function getTablecheckInboxDir(): string {
  return INBOX_DIR;
}
