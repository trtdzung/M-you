import { NextRequest, NextResponse } from "next/server";
import { transferNow } from "@/lib/demo-clock";
import { validateLedgerEntry } from "../model/validate-ledger";
import { goalCashflowInput } from "../server/cashflow-input";
import { loadGoalView } from "../server/goal-view";
import { getGoal } from "../server/goals-repo";
import { appendLedger, InsufficientGoalFundsError } from "../server/ledger-repo";
import { badBody, cifOf, invalid, missingCif, notFound, readJson, type RouteCtx } from "./_http";

/** POST /api/goals/:id/ledger — body { cif, kind, amount, note? } */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  const { id } = await ctx.params;
  const result = validateLedgerEntry(body);
  if (!result.ok) return invalid(result.errors);
  if (!getGoal(cif, id)) return notFound();
  try {
    const now = transferNow();
    const entry = appendLedger(cif, id, result.value, now);
    const goal = loadGoalView(cif, getGoal(cif, id)!, now, goalCashflowInput(cif, now));
    return NextResponse.json({ entry, goal }, { status: 201 });
  } catch (e) {
    if (e instanceof InsufficientGoalFundsError) return invalid({ amount: "Vượt số đã góp" });
    throw e;
  }
}
