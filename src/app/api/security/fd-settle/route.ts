import { NextRequest, NextResponse } from "next/server";
import { settleSavings, SettleError } from "@/lib/security/fd-store";

/**
 * POST /api/security/fd-settle — body `{ cif, accountId, amount }`: settle a
 * savings account early into the current account (demo) → `{ accounts }`.
 * Logs `fd_settled` for the Scam Shield engine (T4, DH5).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof body?.accountId !== "string" || !body.accountId) return NextResponse.json({ error: "accountId is required" }, { status: 422 });
  if (typeof body?.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) return NextResponse.json({ error: "amount is invalid" }, { status: 422 });
  try {
    return NextResponse.json(settleSavings(body.cif, body.accountId, body.amount));
  } catch (err) {
    if (err instanceof SettleError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("POST /api/security/fd-settle failed", err);
    return NextResponse.json({ error: "settle failed" }, { status: 500 });
  }
}
