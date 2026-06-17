import { NextResponse } from "next/server";
import { listContainers, pingDocker } from "@/lib/docker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ping = await pingDocker();
  if (!ping.ok) {
    return NextResponse.json(
      { error: `Cannot reach Docker daemon: ${ping.error}`, containers: [] },
      { status: 502 }
    );
  }
  try {
    const containers = await listContainers();
    return NextResponse.json({ containers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), containers: [] }, { status: 500 });
  }
}
