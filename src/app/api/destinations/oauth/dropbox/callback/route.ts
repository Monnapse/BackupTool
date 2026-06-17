import { NextResponse } from "next/server";
import { getDestination, updateDestination } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (req: Request, q: string) =>
  NextResponse.redirect(new URL(`/destinations?${q}`, req.url));

// Step 2: exchange the code for a refresh token at Dropbox's token endpoint.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const destId = searchParams.get("state");
  if (!code || !destId) return back(req, "error=missing_code");

  const dest = getDestination(destId);
  if (!dest) return back(req, "error=unknown_destination");

  const clientId = (dest.config.clientId as string) || process.env.DROPBOX_CLIENT_ID;
  const clientSecret = (dest.config.clientSecret as string) || process.env.DROPBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back(req, "error=not_configured");

  const base = (process.env.APP_URL || "http://localhost:8723").replace(/\/$/, "");
  const redirect = `${base}/api/destinations/oauth/dropbox/callback`;

  try {
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirect,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok || !data.refresh_token) {
      return back(req, `error=${encodeURIComponent(data.error_description || "token_exchange_failed")}`);
    }
    updateDestination(destId, {
      config: { ...dest.config, refresh_token: data.refresh_token },
    });
    return back(req, "connected=dropbox");
  } catch (e: any) {
    return back(req, `error=${encodeURIComponent(e?.message || "oauth_failed")}`);
  }
}
