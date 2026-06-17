import { NextResponse } from "next/server";
import { listDir, makeDir } from "@/lib/fs-browse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("path");
  if (!target) return NextResponse.json({ error: "path is required" }, { status: 400 });
  try {
    return NextResponse.json(await listDir(target));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}

// Create a new subfolder while browsing.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!b?.parent || !b?.name) {
    return NextResponse.json({ error: "parent and name are required" }, { status: 400 });
  }
  try {
    const path = await makeDir(String(b.parent), String(b.name));
    return NextResponse.json({ path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
