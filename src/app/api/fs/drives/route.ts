import { NextResponse } from "next/server";
import { listDrives, homeDir } from "@/lib/fs-browse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ drives: listDrives(), home: homeDir() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
