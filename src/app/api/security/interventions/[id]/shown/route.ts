import { NextRequest, NextResponse } from "next/server";
import { shown } from "@/lib/security/orchestrator";

/** POST /api/security/interventions/:id/shown — body `{ cif }`; the app reports it displayed the intervention. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return shown(body.cif, id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "intervention is closed or unknown" }, { status: 409 });
  } catch (err) {
    console.error("POST /api/security/interventions/[id]/shown failed", err);
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}
