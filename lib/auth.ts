import "server-only";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  getSecretKey,
  type SessionPayload,
} from "@/lib/session-edge";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7日間

export type { SessionPayload };

export async function hashPin(pin: string) {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string) {
  return bcrypt.compare(pin, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // NODE_ENV(本番ビルドかどうか)ではなく、実際にHTTPSで配信しているかどうかで判定する。
    // 現状はTailscale IPへの平文HTTPで配信する方針(HTTPS化はしない)のため、
    // NODE_ENV==="production"連動だと `next build && next start` に切り替えた瞬間、
    // Secure属性付きCookieがHTTP経由で保存されなくなりログイン不能になる。
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * ログアウトなどでセッションを無効化した後、それ以前に発行済みのJWTがまだ有効期限内でも
 * 使えなくなるようにする(セキュリティ監査finding: session-no-revocation)。
 * proxy.ts(Edge runtime)側のverifySessionTokenは署名・有効期限のみを見る軽量チェックのままとし、
 * ここ(Node runtime、app/(app)/layout.tsxが全ページで呼ぶ)でDBの現在値と突き合わせる。
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sessionVersion: true },
  });
  if (!user || user.sessionVersion !== session.sessionVersion) return null;

  return session;
}

/** 管理者専用ページの先頭で使う。ADMINでなければnullを返す(サーバーアクション側の権限チェックとは別に、ページ自体の閲覧も制限するため)。 */
export async function getAdminSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

/**
 * MANAGERが指定店舗を操作する権限を持つか判定する(StoreAccessで付与された店舗のみ)。
 * ADMINは常に許可。STAFF等それ以外のロールは呼び出し側が別途弾いている前提で常にfalseを返す
 * (セキュリティ監査finding: storeaccess-not-enforced。従来はロールチェックのみでStoreAccessが
 * 一切参照されておらず、MANAGERが全店舗にフルアクセスできてしまっていた)。
 */
export async function hasStoreAccess(session: SessionPayload, storeId: string): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  if (session.role !== "MANAGER") return false;
  const access = await prisma.storeAccess.findUnique({
    where: { userId_storeId: { userId: session.userId, storeId } },
  });
  return access !== null;
}

/**
 * PINでログインするユーザーを特定する。メールアドレス等の識別子は使わず、
 * 登録済みユーザーのPINハッシュと順に照合する(少人数運用のみを想定した設計)。
 */
export async function authenticateByPin(pin: string) {
  const users = await prisma.user.findMany();
  for (const user of users) {
    if (!user.pinHash) continue;
    if (await verifyPin(pin, user.pinHash)) {
      return user;
    }
  }
  return null;
}

/**
 * ログイン後リダイレクト先の検証。自サイト内の相対パスのみ許可する。
 * "//evil.com" や "/\evil.com" のようなプロトコル相対URLはオープンリダイレクトに
 * 悪用できるため、フォールバックとして "/" を返す。
 * タブ・改行等の制御文字はブラウザのURL正規化(WHATWG URL仕様)で除去されて
 * "/\t/evil.com" が "//evil.com" になり得るため、制御文字を含む値も弾く
 * (セキュリティ監査finding: open-redirect-sanitizenextpath)。
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (next && !/[\x00-\x1f\\]/.test(next) && /^\/(?!\/)/.test(next)) {
    return next;
  }
  return "/";
}
