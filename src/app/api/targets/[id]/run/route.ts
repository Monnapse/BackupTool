import { NextResponse } from "next/server";
import { getTarget } from "@/lib/repo";
import { runBackup } from "@/lib/backup/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Backups can take a while; allow a generous execution window.
export const maxDuration = 600;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const target = getTarget(params.id);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  const outcome = await runBackup(params.id, "manual");
  return NextResponse.json({ ok: outcome.ok, run: outcome.run }, { status: outcome.ok ? 200 : 500 });
}
