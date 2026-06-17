import { NextResponse } from "next/server";
import { deleteDestination, getDestination, updateDestination } from "@/lib/repo";
import { publicDestination } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const existing = getDestination(params.id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const patch: any = {};
  if (typeof b.name === "string") patch.name = b.name;
  if (existing.kind === "local" && typeof b.path === "string") {
    patch.config = { ...existing.config, path: b.path };
  }
  const dest = updateDestination(params.id, patch);
  return NextResponse.json({ destination: publicDestination(dest!) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  deleteDestination(params.id);
  return NextResponse.json({ ok: true });
}
