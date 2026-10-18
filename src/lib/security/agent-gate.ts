import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Same key as the read-only agent gateway. Missing or wrong key → 401. */
export function rejectAgent(req: NextRequest): NextResponse | null {
  const expected = process.env.AGENT_API_KEY ?? "";
  const given = req.headers.get("x-agent-key") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
