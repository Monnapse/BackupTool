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

  const config = { ...existing.config };
  let touched = false;
  if (existing.kind === "local" && typeof b.path === "string") {
    config.path = b.path;
    touched = true;
  }
  // Update OAuth app credentials (only overwrite when a non-empty value is sent).
  if (existing.kind !== "local") {
    if (b.clientId) { config.clientId = String(b.clientId); touched = true; }
    if (b.clientSecret) { config.clientSecret = String(b.clientSecret); touched = true; }
    // Persist the chosen backup folder.
    if (typeof b.rootFolderId === "string") { config.rootFolderId = b.rootFolderId; touched = true; }
    if (typeof b.rootFolderName === "string") { config.rootFolderName = b.rootFolderName; touched = true; }
    if (typeof b.basePath === "string") { config.basePath = b.basePath; touched = true; }
  }
  if (touched) patch.config = config;

  const dest = updateDestination(params.id, patch);
  return NextResponse.json({ destination: publicDestination(dest!) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  deleteDestination(params.id);
  return NextResponse.json({ ok: true });
}
