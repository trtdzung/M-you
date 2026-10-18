import { NextRequest, NextResponse } from "next/server";
import { engineAlertTime, engineNow, readEngineClock, writeEngineClock, type EngineClock } from "@/lib/security/clock";

/**
 * Scam Shield engine clock for one persona (demo only): the test tools shift
 * "now" and pin the hour transfers are judged at.
 */

const validCif = (cif: unknown): cif is string => typeof cif === "string" && cif.length > 0 && cif.length <= 64;
const MAX_OFFSET_MS = 400 * 24 * 60 * 60 * 1000;

function view(cif: string) {
  return { ...readEngineClock(cif), now: engineNow(cif).getTime(), alertTime: engineAlertTime(cif).getTime() };
}

/** GET /api/security/clock?cif= → `{ offsetMs, alertHour, now, alertTime }`. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  return NextResponse.json(view(cif));
}

/** PUT /api/security/clock — body `{ cif, offsetMs?, alertHour? }` (alertHour null = real hour). */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!validCif(body?.cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const patch: Partial<EngineClock> = {};
  if (body.offsetMs !== undefined) {
    if (typeof body.offsetMs !== "number" || !Number.isFinite(body.offsetMs) || Math.abs(body.offsetMs) > MAX_OFFSET_MS) {
      return NextResponse.json({ error: "offsetMs is invalid" }, { status: 422 });
    }
    patch.offsetMs = body.offsetMs;
  }
  if (body.alertHour !== undefined) {
    if (body.alertHour !== null && !(Number.isInteger(body.alertHour) && body.alertHour >= 0 && body.alertHour <= 23)) {
      return NextResponse.json({ error: "alertHour is invalid" }, { status: 422 });
    }
    patch.alertHour = body.alertHour;
  }
  writeEngineClock(body.cif, patch);
  return NextResponse.json(view(body.cif));
}
