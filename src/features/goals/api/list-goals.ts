import { NextRequest, NextResponse } from "next/server";
import { transferNow } from "@/lib/demo-clock";
import { goalCashflowInput } from "../server/cashflow-input";
import { loadGoalView } from "../server/goal-view";
import { listGoals } from "../server/goals-repo";
import { cifOf, missingCif } from "./_http";

/** GET /api/goals?cif= */
export async function GET(req: NextRequest) {
  const cif = cifOf(req.nextUrl.searchParams.get("cif"));
  if (!cif) return missingCif();
  const now = transferNow();
  const cashflow = goalCashflowInput(cif, now);
  const goals = listGoals(cif).map((g) => loadGoalView(cif, g, now, cashflow));
  return NextResponse.json({ goals });
}
