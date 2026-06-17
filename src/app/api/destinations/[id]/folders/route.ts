import { NextResponse } from "next/server";
import { getDestination } from "@/lib/repo";
import * as gdrive from "@/lib/destinations/gdrive";
import * as dropbox from "@/lib/destinations/dropbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists folders in the connected cloud account so the user can pick where
// backups go. `parent` drills into a subfolder (Drive folder id / Dropbox path).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const dest = getDestination(params.id);
  if (!dest) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parent = new URL(req.url).searchParams.get("parent") || "";

  try {
    if (dest.kind === "gdrive") {
      const folders = await gdrive.listFolders(dest, parent || undefined);
      return NextResponse.json({
        folders: folders.map((f) => ({ id: f.id, name: f.name })),
      });
    }
    if (dest.kind === "dropbox") {
      const folders = await dropbox.listFolders(dest, parent);
      return NextResponse.json({
        folders: folders.map((f) => ({ id: f.path, name: f.name })),
      });
    }
    return NextResponse.json({ error: "not a cloud destination" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
