import { NextResponse } from "next/server";
import { getDestination } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 1: redirect to Dropbox's authorize endpoint (offline => refresh token).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const destId = searchParams.get("destId");
  const dest = destId ? getDestination(destId) : null;
  if (!dest) {
    return NextResponse.json({ error: "unknown destination" }, { status: 400 });
  }
  const clientId = (dest.config.clientId as string) || process.env.DROPBOX_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Dropbox app key not set for this destination" }, { status: 400 });
  }
  const base = (process.env.APP_URL || "http://localhost:8723").replace(/\/$/, "");
  const redirect = `${base}/api/destinations/oauth/dropbox/callback`;

  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("state", dest.id);
  return NextResponse.redirect(url.toString());
}
