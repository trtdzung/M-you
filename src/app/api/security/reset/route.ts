import { NextRequest, NextResponse } from "next/server";
import { resetPersonaEngine } from "@/lib/security/test-reset";

/** POST /api/security/reset — body `{ cif }`. Clears that persona's engine data (test tools only). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) {
    return NextResponse.json({ error: "cif is required" }, { status: 422 });
  }
  try {
    resetPersonaEngine(body.cif);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/security/reset failed", err);
    return NextResponse.json({ error: "reset failed" }, { status: 500 });
  }
}
