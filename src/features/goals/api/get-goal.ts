import { NextRequest, NextResponse } from "next/server";
import { withCurrentAmount } from "../server/goal-amount";
import { getGoal } from "../server/goals-repo";
import { listLedger } from "../server/ledger-repo";
import { cifOf, missingCif, notFound, type RouteCtx } from "./_http";

/** GET /api/goals/:id?cif= */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const cif = cifOf(req.nextUrl.searchParams.get("cif"));
  if (!cif) return missingCif();
  const { id } = await ctx.params;
  const goal = getGoal(cif, id);
  if (!goal) return notFound();
  return NextResponse.json({
    goal: withCurrentAmount(cif, goal),
    ledger: listLedger(cif, id),
  });
}
