// middleware(Edge runtime)と lib/auth.ts の両方から使う軽量ユーティリティ。
// next/headers など Node 専用APIに依存しないこと。
import { jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE_NAME = "note_ai_session";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  sessionVersion: number;
};

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payloadToSession(payload);
  } catch {
    return null;
  }
}

function payloadToSession(payload: JWTPayload): SessionPayload {
  return {
    userId: payload.userId as string,
    email: payload.email as string,
    name: payload.name as string,
    role: payload.role as Role,
    // このフィールド追加前に発行された既存トークンにはsessionVersionが無いため、0扱いにする
    // (User.sessionVersionのデフォルト値も0なので、既存セッションは移行時に無効化されない)。
    sessionVersion: typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0,
  };
}

export { getSecretKey };
