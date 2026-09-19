import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { exchangeCodeAndSaveConnection, GOOGLE_OAUTH_STATE_COOKIE, isOAuthStateValid } from "@/lib/integrations/google-sheets";

export async function GET(request: Request) {
  const session = await getSession();
  const settingsUrl = new URL("/settings/google", request.url);

  if (!session || session.role !== "ADMIN") {
    settingsUrl.searchParams.set("error", "権限がありません。");
    return NextResponse.redirect(settingsUrl);
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (!code) {
    settingsUrl.searchParams.set("error", "認可コードを取得できませんでした。");
    return NextResponse.redirect(settingsUrl);
  }

  // stateを検証し、この連携開始リクエストを自分が発行したものだけを受け付ける
  // (セキュリティ監査finding: oauth-missing-state-csrf。stateが無いと、攻撃者が自分のGoogleアカウントで
  // 取得した認可コードをADMINに踏ませるだけで連携先を乗っ取れてしまう)。
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const receivedState = requestUrl.searchParams.get("state");
  const stateValid = isOAuthStateValid(expectedState, receivedState);
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE); // 使い捨て(検証の成否によらず必ず消費する)

  if (!stateValid) {
    settingsUrl.searchParams.set("error", "認可リクエストの検証に失敗しました。もう一度連携をやり直してください。");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await exchangeCodeAndSaveConnection(code, session.userId);
    settingsUrl.searchParams.set("connected", "1");
  } catch (err) {
    settingsUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : String(err)
    );
  }

  return NextResponse.redirect(settingsUrl);
}
