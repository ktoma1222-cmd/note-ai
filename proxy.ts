import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session-edge";

const PUBLIC_PATHS = ["/login"];

// 一般公開(Netlify)に伴い、PINログインの手前にもう一段の壁としてHTTP Basic認証を追加する
// (2026-10-07。これまではTailscaleのプライベートネットワークがこの役割を担っていた)。
// BASIC_AUTH_USER/BASIC_AUTH_PASSの両方が設定されている場合のみ有効(未設定ならローカル開発に影響なし)。
// 対象はPINログインを含む画面のみ。/api/*(MCP・cron)は既存のBearerトークン認証で保護済みのため対象外、
// /api/auth/*(Google OAuthコールバック)はGoogle側から直接叩かれるため従来通り対象外。

// Edge Runtime(Node専用のcrypto.timingSafeEqualが使えない)向けの自前の定数時間文字列比較。
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function checkBasicAuth(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;
  if (!expectedUser || !expectedPass) return null;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const sepIndex = decoded.indexOf(":");
      if (sepIndex !== -1) {
        const reqUser = decoded.slice(0, sepIndex);
        const reqPass = decoded.slice(sepIndex + 1);
        if (
          timingSafeStringEqual(reqUser, expectedUser) &&
          timingSafeStringEqual(reqPass, expectedPass)
        ) {
          return null;
        }
      }
    } catch {
      // 不正なbase64等は未認証として扱う
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="NOTE AI"' },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // APIルート(Route Handler)はセッションクッキーではなく各自の認証方式
    // (例: /api/cron/* のBearerトークン)で保護するため、ここでは素通しする。
    return NextResponse.next();
  }

  const basicAuthChallenge = checkBasicAuth(request);
  if (basicAuthChallenge) return basicAuthChallenge;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
