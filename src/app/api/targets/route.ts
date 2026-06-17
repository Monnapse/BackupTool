import { NextResponse } from "next/server";
import { createTarget, listTargets } from "@/lib/repo";
import { reloadSchedules } from "@/lib/scheduler";
import { parseTargetBody } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ targets: listTargets() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const target = createTarget(parseTargetBody(body));
    reloadSchedules();
    return NextResponse.json({ target }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
