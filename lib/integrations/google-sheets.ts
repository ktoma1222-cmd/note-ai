import "server-only";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";

// OAuth連携開始リクエストとコールバックを紐付けるためのCSRF対策state値。
// state無しだと、攻撃者が自分のGoogleアカウントで認可コードを取得し、ログイン中のADMINに
// コールバックURLを踏ませるだけでその予約データ連携先を乗っ取れてしまう
// (セキュリティ監査finding: oauth-missing-state-csrf)。
export const GOOGLE_OAUTH_STATE_COOKIE = "note_ai_google_oauth_state";
export const GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60; // 10分。認可フローを開始してから戻ってくるまでの猶予

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** state値の一致を定数時間で比較する(タイミング攻撃対策)。 */
export function isOAuthStateValid(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI が設定されていません。"
    );
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [SHEETS_READONLY_SCOPE, EMAIL_SCOPE],
    state,
  });
}

export async function exchangeCodeAndSaveConnection(code: string, userId: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Googleからrefresh_tokenを取得できませんでした。一度連携を解除し、再度認可し直してください(prompt=consentが必要です)。"
    );
  }
  client.setCredentials(tokens);
  const info = await client.getTokenInfo(tokens.access_token!);
  const email = info.email ?? "(不明なアカウント)";

  await prisma.googleConnection.deleteMany({});
  await prisma.googleConnection.create({
    data: {
      userId,
      googleEmail: email,
      refreshToken: encryptSecret(tokens.refresh_token),
    },
  });

  return { email };
}

export async function getGoogleConnection() {
  return prisma.googleConnection.findFirst({ orderBy: { createdAt: "desc" } });
}

async function getValidAccessToken(): Promise<string> {
  const connection = await getGoogleConnection();
  if (!connection) {
    throw new Error("Googleアカウントが接続されていません。設定 → Google連携から接続してください。");
  }
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: decryptSecret(connection.refreshToken) });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Googleのアクセストークン取得に失敗しました。");
  return token;
}

/** URL中のgid(シートタブのID)からシート名を解決する。gid未指定/0の場合は既定(先頭)シートを使うためnullを返す。 */
export async function getSheetTitleByGid(
  spreadsheetId: string,
  gid: number
): Promise<string | null> {
  const accessToken = await getValidAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets API error (${res.status}): ${body}`);
  }
  const data = await res.json();
  type SheetProps = { properties: { sheetId: number; title: string } };
  const sheets: SheetProps[] = data.sheets ?? [];
  const match = sheets.find((s) => s.properties.sheetId === gid);
  return match?.properties.title ?? null;
}

/** スプレッドシートの指定範囲を2次元配列で取得する。gidを指定するとそのシートタブを対象にする。 */
export async function readSheetGrid(
  spreadsheetId: string,
  gid: number | null = null,
  range = "A1:ZZ300"
): Promise<string[][]> {
  const accessToken = await getValidAccessToken();

  let fullRange = range;
  if (gid !== null && gid !== undefined) {
    const title = await getSheetTitleByGid(spreadsheetId, gid);
    if (!title) {
      throw new Error(`指定されたシートタブ(gid=${gid})が見つかりませんでした。`);
    }
    fullRange = `'${title.replace(/'/g, "''")}'!${range}`;
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      fullRange
    )}?valueRenderOption=UNFORMATTED_VALUE`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets API error (${res.status}): ${body}`);
  }
  const data = await res.json();
  return (data.values ?? []) as string[][];
}

export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export function extractGid(urlOrId: string): number | null {
  const match = urlOrId.match(/[?&#]gid=(\d+)/);
  if (!match) return null;
  const gid = parseInt(match[1], 10);
  return Number.isFinite(gid) ? gid : null;
}
