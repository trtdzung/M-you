import { NextRequest, NextResponse } from "next/server";
import { transferNow } from "@/lib/demo-clock";
import { validateGoalCreate } from "../model/validate-goal";
import { createGoalWithOpening } from "../server/create-goal";
import { goalCashflowInput } from "../server/cashflow-input";
import { loadGoalView } from "../server/goal-view";
import { badBody, cifOf, invalid, missingCif, readJson } from "./_http";

/** POST /api/goals — body { cif, name, targetAmount, targetDate, flexibility, ... } */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  const now = transferNow();
  const result = validateGoalCreate(body, now);
  if (!result.ok) return invalid(result.errors);
  const goal = createGoalWithOpening(cif, result.value, now);
  return NextResponse.json({ goal: loadGoalView(cif, goal, now, goalCashflowInput(cif, now)) }, { status: 201 });
}
