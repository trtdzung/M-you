import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { appNow } from "@/lib/app-clock";
import { readEngineClock } from "@/lib/security/clock";
import { dateToMonthKey } from "@/domain/engine/types";

export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const now = appNow(cif);
  return NextResponse.json({
    now: now.toISOString(),
    today: new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10),
    monthKey: dateToMonthKey(now),
    offsetMs: readEngineClock(cif).offsetMs,
  }, { headers: { "Cache-Control": "no-store" } });
}
