import { NextResponse } from "next/server";
import { getDestination } from "@/lib/repo";
import { driverFor } from "@/lib/destinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const dest = getDestination(params.id);
  if (!dest) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    await driverFor(dest).test(dest);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 400 });
  }
}
