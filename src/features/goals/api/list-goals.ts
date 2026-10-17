import { NextRequest, NextResponse } from "next/server";
import { withCurrentAmount } from "../server/goal-amount";
import { listGoals } from "../server/goals-repo";
import { cifOf, missingCif } from "./_http";

/** GET /api/goals?cif= */
export async function GET(req: NextRequest) {
  const cif = cifOf(req.nextUrl.searchParams.get("cif"));
  if (!cif) return missingCif();
  return NextResponse.json({ goals: listGoals(cif).map((g) => withCurrentAmount(cif, g)) });
}
