import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runNotionSync } from "@/lib/sync/notion-sync";

// 本番(Vercel等)でスケジューラから叩く定期同期エンドポイント。
// 例: vercel.json に {"crons": [{"path": "/api/cron/notion-sync", "schedule": "0 */3 * * *"}]} を追加し、
// CRON_SECRET を環境変数に設定するとVercel Cronからのリクエストのみ許可される。

/** 定数時間でのBearerトークン比較(タイミング攻撃対策、セキュリティ監査finding: cron-secret-timing)。 */
function isAuthorized(auth: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(auth ?? "");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET が設定されていません。" },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization");
  if (!isAuthorized(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runNotionSync();
  return NextResponse.json(result);
}
