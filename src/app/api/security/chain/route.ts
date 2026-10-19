import { NextRequest, NextResponse } from "next/server";
import { AccountNotFoundError } from "@/lib/accounts-store";
import { ChainError, recordRisingTransfers } from "@/lib/security/simulate-chain";

/**
 * POST /api/security/chain — body `{ cif, accountId, count, recipientName, recipientAccount, recipientBank }`.
 * Writes real debits plus `transfer_out` events (rising amounts, inside 10 minutes).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) {
    return NextResponse.json({ error: "cif is required" }, { status: 422 });
  }
  try {
    const events = recordRisingTransfers(body.cif, {
      accountId: String(body.accountId ?? ""),
      count: body.count,
      recipientName: String(body.recipientName ?? ""),
      recipientAccount: String(body.recipientAccount ?? ""),
      recipientBank: String(body.recipientBank ?? ""),
    });
    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof ChainError) return NextResponse.json({ error: err.message }, { status: 422 });
    if (err instanceof AccountNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("POST /api/security/chain failed", err);
    return NextResponse.json({ error: "chain failed" }, { status: 500 });
  }
}
