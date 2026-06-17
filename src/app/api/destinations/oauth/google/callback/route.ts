import { NextResponse } from "next/server";
import { getDestination, updateDestination } from "@/lib/repo";
import { oauthClient } from "@/lib/destinations/gdrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (req: Request, q: string) =>
  NextResponse.redirect(new URL(`/destinations?${q}`, req.url));

// Step 2: Google redirects back here with a code; exchange it for tokens.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const destId = searchParams.get("state");
  if (!code || !destId) return back(req, "error=missing_code");

  const dest = getDestination(destId);
  if (!dest) return back(req, "error=unknown_destination");

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      return back(req, "error=no_refresh_token");
    }
    updateDestination(destId, {
      config: { ...dest.config, refresh_token: tokens.refresh_token },
    });
    return back(req, "connected=google");
  } catch (e: any) {
    return back(req, `error=${encodeURIComponent(e?.message || "oauth_failed")}`);
  }
}
