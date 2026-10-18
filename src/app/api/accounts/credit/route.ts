import { NextRequest, NextResponse } from "next/server";
import { creditAccount, CreditAccountNotFoundError } from "@/lib/security/credit-store";
import { evaluate } from "@/lib/security/orchestrator";

/**
 * POST /api/accounts/credit — money IN for a demo persona (simulated bank
 * credit): body `{ cif, accountId, amount, sender: { name, account, bank },
 * memo?, kind: "salary" | "income" | "transfer", txnId? }`. Adds to `balance` +
 * `available_balance`, stores the credit, logs `incoming_credit`, and returns
 * `{ accounts, transaction, interventions }` (the Scam Shield tips the credit
 * raised: BT3–BT5). Only the test tools call this route.
 */

const KINDS = new Set(["salary", "income", "transfer"]);
const MAX_AMOUNT = 100_000_000_000;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sender = body?.sender;
  if (!text(body?.cif, 64)) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!text(body?.accountId, 64)) return NextResponse.json({ error: "accountId is required" }, { status: 422 });
  if (typeof body?.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > MAX_AMOUNT) {
    return NextResponse.json({ error: "amount is invalid" }, { status: 422 });
  }
  if (!text(sender?.name, 80) || !text(sender?.account, 34) || !/\d{4}/.test(sender.account) || !text(sender?.bank, 80)) {
    return NextResponse.json({ error: "sender is invalid" }, { status: 422 });
  }
  if (body.memo !== undefined && body.memo !== null && !(typeof body.memo === "string" && body.memo.length <= 140)) {
    return NextResponse.json({ error: "memo is invalid" }, { status: 422 });
  }
  if (!KINDS.has(body?.kind)) return NextResponse.json({ error: "kind is invalid" }, { status: 422 });
  if (body.txnId !== undefined && !text(body.txnId, 80)) return NextResponse.json({ error: "txnId is invalid" }, { status: 422 });
  try {
    const result = creditAccount(body.cif, {
      accountId: body.accountId,
      amount: body.amount,
      sender: { name: sender.name.trim(), account: sender.account.trim(), bank: sender.bank.trim() },
      memo: typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : undefined,
      kind: body.kind,
      txnId: body.txnId,
    });
    // Scam Shield: money in is an engine event (BT3–BT5). The engine failing never undoes the credit.
    let interventions: unknown[] = [];
    try {
      interventions = evaluate(body.cif, "incoming_credit", { txnId: result.transaction.id });
    } catch (err) {
      console.error("Scam Shield evaluate after credit failed", err);
    }
    return NextResponse.json({ ...result, interventions });
  } catch (err) {
    if (err instanceof CreditAccountNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("Account credit failed", err);
    return NextResponse.json({ error: "credit failed" }, { status: 500 });
  }
}
