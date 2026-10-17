import { NextRequest, NextResponse } from "next/server";
import { goalCashflowInput } from "../server/cashflow-input";
import { toGoalView } from "../server/goal-view";
import { getGoal } from "../server/goals-repo";
import { transferNow } from "@/lib/demo-clock";
import { listLedger } from "../server/ledger-repo";
import { cifOf, missingCif, notFound, type RouteCtx } from "./_http";

/** GET /api/goals/:id?cif= */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const cif = cifOf(req.nextUrl.searchParams.get("cif"));
  if (!cif) return missingCif();
  const { id } = await ctx.params;
  const goal = getGoal(cif, id);
  if (!goal) return notFound();
  const now = transferNow();
  const ledger = listLedger(cif, id);
  return NextResponse.json({
    goal: toGoalView(goal, ledger, now, goalCashflowInput(cif, now)),
    ledger,
  });
}
