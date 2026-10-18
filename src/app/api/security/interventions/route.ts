import { NextRequest, NextResponse } from "next/server";
import { listOpen } from "@/lib/security/orchestrator";

/** GET /api/security/interventions?cif=&target= — open (pending or shown) interventions, newest first. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cif = params.get("cif");
  const target = params.get("target") ?? undefined;
  if (!cif || cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (target !== undefined && target.length > 100) return NextResponse.json({ error: "target is invalid" }, { status: 422 });
  try {
    return NextResponse.json({ interventions: listOpen(cif, target) });
  } catch (err) {
    console.error("GET /api/security/interventions failed", err);
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}
