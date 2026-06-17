import { NextResponse } from "next/server";
import { listRuns, listRunsForTarget } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get("targetId");
  const runs = targetId ? listRunsForTarget(targetId) : listRuns(200);
  return NextResponse.json({ runs });
}
