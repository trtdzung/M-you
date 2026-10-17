import { NextRequest, NextResponse } from "next/server";
import type { Transaction } from "@/domain/models";
import { AccountNotFoundError, debitAccount } from "@/lib/accounts-store";
import { ManualTxnIdConflictError } from "@/lib/manual-txns-store";

/**
 * POST /api/accounts/debit — record a confirmed transfer's debit against an
 * account (body `{cif, accountId, amount, txn?}`). Decrements `balance` +
 * `available_balance` on the row and returns the persona's accounts as they now
 * read back. This is the ONLY money-moving write to `accounts`; it is reached
 * exclusively from the human-confirmed Chuyển tiền flow (never the AI facade —
 * invariant #3). No OTP/credential ever touches this route.
 *
 * H14/U1: when `txn` (the transfer's self-reported primary record) is sent, the
 * debit and its insert are ONE DB transaction — both land or neither does (a
 * 500 means nothing was debited). `txn.amount` must equal `amount` and it must
 * be a debit, so the stored record always matches the money that moved.
 */

/** A minimally-valid transfer record that matches the debited amount. */
function isMatchingTxn(v: unknown, amount: number): v is Transaction {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    t.id !== "" &&
    typeof t.postedAt === "string" &&
    !Number.isNaN(Date.parse(t.postedAt)) &&
    t.amount === amount &&
    t.direction === "debit" &&
    typeof t.categoryId === "string"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  const accountId = body?.accountId;
  const amount = body?.amount;
  const txn: unknown = body?.txn;
  if (typeof cif !== "string" || cif === "") return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof accountId !== "string" || accountId === "") return NextResponse.json({ error: "accountId is required" }, { status: 422 });
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount is invalid" }, { status: 422 });
  }
  if (txn !== undefined && !isMatchingTxn(txn, amount)) {
    return NextResponse.json({ error: "txn is invalid or does not match amount" }, { status: 422 });
  }
  try {
    return NextResponse.json(debitAccount(cif, accountId, amount, txn as Transaction | undefined));
  } catch (err) {
    if (err instanceof AccountNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ManualTxnIdConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("Account debit failed", err);
    return NextResponse.json({ error: "debit failed" }, { status: 500 });
  }
}
