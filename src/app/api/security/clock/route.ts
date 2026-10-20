import { NextRequest, NextResponse } from "next/server";
import { engineNow, readEngineClock } from "@/lib/security/clock";

/**
 * Scam Shield engine clock for one persona: demo clock + goals advance offset.
 * Read-only; offset is advanced by goals (`advanceGoalClock`), not by this route.
 */

const validCif = (cif: unknown): cif is string => typeof cif === "string" && cif.length > 0 && cif.length <= 64;

/** GET /api/security/clock?cif= → `{ now, offsetMs }`. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  return NextResponse.json({ now: engineNow(cif).getTime(), offsetMs: readEngineClock(cif).offsetMs });
}
