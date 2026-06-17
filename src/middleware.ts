import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Auth gate. Everything is protected except the login page and the login API.
// Kept self-contained (no next/headers import) so it runs in the edge runtime.

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

async function valid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.APP_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const ok = await valid(req.cookies.get("bt_session")?.value);
  if (ok) return NextResponse.next();

  // API calls get a 401; page requests get redirected to login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
