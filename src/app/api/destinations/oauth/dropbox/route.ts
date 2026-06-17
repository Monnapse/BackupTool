import { NextResponse } from "next/server";
import { getDestination } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 1: redirect to Dropbox's authorize endpoint (offline => refresh token).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const destId = searchParams.get("destId");
  if (!destId || !getDestination(destId)) {
    return NextResponse.json({ error: "unknown destination" }, { status: 400 });
  }
  const clientId = process.env.DROPBOX_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "DROPBOX_CLIENT_ID not configured" }, { status: 500 });
  }
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const redirect = `${base}/api/destinations/oauth/dropbox/callback`;

  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("state", destId);
  return NextResponse.redirect(url.toString());
}
