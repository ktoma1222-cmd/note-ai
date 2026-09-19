import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getGoogleAuthUrl,
  generateOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/lib/integrations/google-sheets";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings/google", request.url));
  }
  try {
    const state = generateOAuthState();
    const url = getGoogleAuthUrl(state);
    const response = NextResponse.redirect(url);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
      maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
