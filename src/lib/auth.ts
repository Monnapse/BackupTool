import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Minimal single-password auth. A valid password mints a signed JWT stored in
// an httpOnly cookie; middleware checks it on every protected route.

const COOKIE = "bt_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret(): Uint8Array {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("APP_SECRET is not set.");
  return new TextEncoder().encode(s);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  // Constant-time-ish compare; lengths differ rarely and aren't secret here.
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Self-hosted tools are usually reached over plain HTTP on a LAN. A `secure`
    // cookie would be dropped by the browser on http://, causing an endless
    // login bounce. Only require HTTPS when explicitly opted in.
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function destroySession(): void {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

/** Verify a raw token string (used by middleware, which has no `cookies()`). */
export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = COOKIE;
