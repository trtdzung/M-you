import { NextRequest, NextResponse } from "next/server";
import { respond } from "@/lib/security/orchestrator";

/**
 * POST /api/security/interventions/:id/respond — body `{ cif, choice }` (the chip
 * or button text). Logs `intervention_answered` and returns `{ action }`: what
 * the app does next. 409 when the intervention is already closed.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof body?.choice !== "string" || !body.choice.trim() || body.choice.length > 80) return NextResponse.json({ error: "choice is invalid" }, { status: 422 });
  try {
    const action = respond(body.cif, id, body.choice.trim());
    if (!action) return NextResponse.json({ error: "intervention is closed or unknown" }, { status: 409 });
    return NextResponse.json({ action });
  } catch (err) {
    console.error("POST /api/security/interventions/[id]/respond failed", err);
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}
