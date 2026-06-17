import { NextResponse } from "next/server";
import { pingDocker } from "@/lib/docker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const docker = await pingDocker();
  return NextResponse.json({
    docker,
    oauth: {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      dropbox: Boolean(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET),
    },
  });
}
