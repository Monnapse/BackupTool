import { NextResponse } from "next/server";
import { pingDocker } from "@/lib/docker";
import { countSpool } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const docker = await pingDocker();
  return NextResponse.json({
    docker,
    // Backups saved locally, waiting for an offline destination to return.
    pendingSync: countSpool(),
    oauth: {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      dropbox: Boolean(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET),
    },
  });
}
