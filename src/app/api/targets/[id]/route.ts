import { NextResponse } from "next/server";
import { deleteTarget, getTarget, updateTarget } from "@/lib/repo";
import { reloadSchedules } from "@/lib/scheduler";
import { parseTargetBody } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const target = getTarget(params.id);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Don't leak the stored password to the client.
  return NextResponse.json({ target: { ...target, config: { ...target.config, password: target.config.password ? "********" : "" } } });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const existing = getTarget(params.id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    const body = await req.json();
    // Preserve the existing password if the client sent the masked placeholder.
    if (body?.config && body.config.password === "********") {
      body.config.password = existing.config.password;
    }
    const target = updateTarget(params.id, parseTargetBody(body));
    reloadSchedules();
    return NextResponse.json({ target });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  deleteTarget(params.id);
  reloadSchedules();
  return NextResponse.json({ ok: true });
}
