import { NextResponse } from "next/server";
import { listDrives, homeDir } from "@/lib/fs-browse";
import { automountBlocked } from "@/lib/automount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      drives: listDrives(),
      home: homeDir(),
      // Removable devices we detected but couldn't mount (and why), so the
      // picker can explain instead of silently showing nothing.
      blocked: automountBlocked(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
