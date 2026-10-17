import { NextRequest, NextResponse } from "next/server";
import { transferNow } from "@/lib/demo-clock";
import { validateGoalUpdate } from "../model/validate-goal";
import { goalCashflowInput } from "../server/cashflow-input";
import { loadGoalView } from "../server/goal-view";
import { updateGoal } from "../server/goals-repo";
import { badBody, cifOf, invalid, missingCif, notFound, readJson, type RouteCtx } from "./_http";

/** PUT /api/goals/:id — body { cif, ...fields, status? } */
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  const { id } = await ctx.params;
  const now = transferNow();
  const result = validateGoalUpdate(body, now);
  if (!result.ok) return invalid(result.errors);
  const goal = updateGoal(cif, id, result.value, now);
  if (!goal) return notFound();
  return NextResponse.json({ goal: loadGoalView(cif, goal, now, goalCashflowInput(cif, now)) });
}
