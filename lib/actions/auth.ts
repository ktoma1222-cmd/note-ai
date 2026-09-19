"use server";

import { redirect } from "next/navigation";
import { authenticateByPin, setSessionCookie, clearSessionCookie, sanitizeNextPath, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = {
  error: string | null;
};

// PINは数字6〜8桁のみなのでパスワードより総当たりに弱い。
// 連続失敗のロック状態はDB(LoginLockState、単一行)に永続化する
// (モジュール変数だと開発サーバーのHMR等で状態が失われるため)。
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
const LOCK_STATE_ID = "singleton";

async function getLockState() {
  return prisma.loginLockState.upsert({
    where: { id: LOCK_STATE_ID },
    update: {},
    create: { id: LOCK_STATE_ID },
  });
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const pin = String(formData.get("pin") ?? "").trim();
  const next = sanitizeNextPath(String(formData.get("next") ?? ""));

  if (!/^\d{6,8}$/.test(pin)) {
    return { error: "PINは6〜8桁の数字で入力してください。" };
  }

  // 正しいPINでのログインは、他の匿名の誰かが誤ったPINを送り続けて発生させたロックの
  // 影響を受けない(先に正誤を判定し、ロック状態のチェック・カウントは失敗時のみ行う)。
  // ロック判定を常に先に行うと、匿名の第三者が誤PINを5回送るだけで全スタッフのログインを
  // 締め出せてしまうため(セキュリティ監査finding: global-pin-lockout-dos)。
  const user = await authenticateByPin(pin);
  if (user) {
    await prisma.loginLockState.upsert({
      where: { id: LOCK_STATE_ID },
      update: { failedAttempts: 0, lockedUntil: null },
      create: { id: LOCK_STATE_ID },
    });

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        targetType: "User",
        targetId: user.id,
      },
    });

    redirect(next);
  }

  const lockState = await getLockState();
  if (lockState.lockedUntil && lockState.lockedUntil.getTime() > Date.now()) {
    const remainingMinutes = Math.ceil((lockState.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      error: `PINの入力に複数回失敗したため、一時的にロックされています。約${remainingMinutes}分後に再度お試しください。`,
    };
  }

  const failedAttempts = lockState.failedAttempts + 1;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.loginLockState.update({
      where: { id: LOCK_STATE_ID },
      data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
    });
    return {
      error: "PINの入力に複数回失敗したため、一時的にログインをロックしました。しばらくしてから再度お試しください。",
    };
  }
  await prisma.loginLockState.update({
    where: { id: LOCK_STATE_ID },
    data: { failedAttempts },
  });
  return { error: "PINが正しくありません。" };
}

export async function logoutAction() {
  // sessionVersionをインクリメントし、これまで発行済みのトークン(端末に残っていたコピー等)を
  // 有効期限を待たずに即座に無効化する(セキュリティ監査finding: session-no-revocation)。
  const session = await getSession();
  if (session) {
    await prisma.user.update({
      where: { id: session.userId },
      data: { sessionVersion: { increment: 1 } },
    });
  }
  await clearSessionCookie();
  redirect("/login");
}
