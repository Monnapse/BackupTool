import { NextResponse } from "next/server";
import { getDestination } from "@/lib/repo";
import { oauthClient } from "@/lib/destinations/gdrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 1: redirect the admin to Google's consent screen.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const destId = searchParams.get("destId");
  const dest = destId ? getDestination(destId) : null;
  if (!dest) {
    return NextResponse.json({ error: "unknown destination" }, { status: 400 });
  }
  try {
    const client = oauthClient({
      clientId: dest.config.clientId as string,
      clientSecret: dest.config.clientSecret as string,
    });
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // force a refresh_token every time
      scope: ["https://www.googleapis.com/auth/drive.file"],
      state: dest.id,
    });
    return NextResponse.redirect(url);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
