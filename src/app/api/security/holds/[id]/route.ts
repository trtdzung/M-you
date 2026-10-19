import { NextRequest, NextResponse } from "next/server";
import { getHold, updateHold } from "@/lib/security/holds";

const validCif = (cif: unknown): cif is string => typeof cif === "string" && cif.length > 0 && cif.length <= 64;

/** GET /api/security/holds/:id?cif= → `{ hold }` with the time left on the engine clock. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cif = req.nextUrl.searchParams.get("cif");
  if (!validCif(cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const hold = getHold(cif, id);
  return hold ? NextResponse.json({ hold }) : NextResponse.json({ error: "hold not found" }, { status: 404 });
}

/**
 * POST /api/security/holds/:id — body `{ cif, action }`: "cancel" (the customer
 * drops it), "sent" (it went after the wait; refused while time is left), or
 * "skip" (test tools: end the wait now). 409 when the hold is closed.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!validCif(body?.cif)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!["cancel", "sent", "skip"].includes(body?.action)) return NextResponse.json({ error: "action is invalid" }, { status: 422 });
  const hold = updateHold(body.cif, id, body.action);
  return hold ? NextResponse.json({ hold }) : NextResponse.json({ error: "hold is closed, unknown or still waiting" }, { status: 409 });
}
