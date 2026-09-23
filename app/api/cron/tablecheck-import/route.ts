import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runTablecheckFolderImport } from "@/lib/sync/tablecheck-folder-import";

// TableCheckは手動CSVダウンロードしか提供していないため、ダウンロード自体は引き続き人力。
// 「incoming/フォルダにCSVを置くだけ」の半自動化として、このエンドポイントを定期的に
// (launchd等の外部スケジューラから)叩くとフォルダ内のCSVを自動取込する。
// 認証はNotion同期(/api/cron/notion-sync)と同じCRON_SECRETのBearerトークン方式を流用する。

function isAuthorized(auth: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(auth ?? "");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET が設定されていません。" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (!isAuthorized(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runTablecheckFolderImport();
  return NextResponse.json(result);
}
