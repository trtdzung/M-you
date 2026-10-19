import { NextRequest, NextResponse } from "next/server";
import { goalCashflowInput } from "../server/cashflow-input";
import { toGoalView } from "../server/goal-view";
import { getGoal, resumeExpiredPauses } from "../server/goals-repo";
import { appNow } from "@/lib/app-clock";
import { listLedger } from "../server/ledger-repo";
import { cifOf, missingCif, notFound, type RouteCtx } from "./_http";

/** GET /api/goals/:id?cif= */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const cif = cifOf(req.nextUrl.searchParams.get("cif"));
  if (!cif) return missingCif();
  const { id } = await ctx.params;
  const now = appNow(cif);
  resumeExpiredPauses(cif, now);
  const goal = getGoal(cif, id);
  if (!goal) return notFound();
  const ledger = listLedger(cif, id);
  return NextResponse.json({
    goal: toGoalView(goal, ledger, now, goalCashflowInput(cif, now)),
    ledger,
  });
}
