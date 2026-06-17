import { NextResponse } from "next/server";
import { createDestination, listDestinations } from "@/lib/repo";
import { publicDestination } from "@/lib/api-helpers";
import type { DestinationKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: DestinationKind[] = ["local", "gdrive", "dropbox"];

export async function GET() {
  return NextResponse.json({ destinations: listDestinations().map(publicDestination) });
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.name) throw new Error("name is required");
    if (!KINDS.includes(b.kind)) throw new Error("invalid kind");

    const config: Record<string, unknown> = {};
    if (b.kind === "local") {
      if (!b.path) throw new Error("path is required for a local destination");
      config.path = String(b.path);
    }
    // Cloud destinations start unconnected; tokens are added via the OAuth flow.
    const dest = createDestination({ name: String(b.name), kind: b.kind, config });
    return NextResponse.json({ destination: publicDestination(dest) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
