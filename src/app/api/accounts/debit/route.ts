import { NextRequest, NextResponse } from "next/server";
import { debitAccount } from "@/lib/accounts-store";

/**
 * POST /api/accounts/debit — record a confirmed transfer's debit against an
 * account (body `{cif, accountId, amount}`). Decrements `balance` +
 * `available_balance` on the row and returns the persona's accounts as they now
 * read back. This is the ONLY money-moving write to `accounts`; it is reached
 * exclusively from the human-confirmed Chuyển tiền flow (never the AI facade —
 * invariant #3). No OTP/credential ever touches this route.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  const accountId = body?.accountId;
  const amount = body?.amount;
  if (typeof cif !== "string" || cif === "") return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof accountId !== "string" || accountId === "") return NextResponse.json({ error: "accountId is required" }, { status: 422 });
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount is invalid" }, { status: 422 });
  }
  return NextResponse.json(debitAccount(cif, accountId, amount));
}
