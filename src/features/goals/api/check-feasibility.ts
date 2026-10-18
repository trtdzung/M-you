import { NextRequest, NextResponse } from "next/server";
import { transferNow } from "@/lib/demo-clock";
import { assessFeasibility } from "../engine/feasibility";
import { buildLevers } from "../engine/levers";
import { averageSurplus } from "../engine/surplus";
import type { FieldErrors } from "../model/types";
import { validateGoalCreate } from "../model/validate-goal";
import { goalCashflowInput } from "../server/cashflow-input";
import { badBody, cifOf, invalid, missingCif, readJson } from "./_http";

/** Optional integer field; undefined/null -> null, junk -> error. */
function optionalInt(v: unknown, field: string, errors: FieldErrors, min?: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || (min !== undefined && v < min)) {
    errors[field] = "Số tiền không hợp lệ";
    return null;
  }
  return v;
}

/** POST /api/goals/feasibility — read-only what-if; never writes to the DB. */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  const now = transferNow();

  const checked = validateGoalCreate(
    { name: "x", flexibility: "flexible", ...body, monthlyContribution: null, openingAmount: null },
    now,
  );
  const errors: FieldErrors = { ...checked.errors };
  const currentAmount = optionalInt(body.currentAmount, "currentAmount", errors, 0) ?? 0;
  const estimated = optionalInt(body.estimatedMonthlySurplus, "estimatedMonthlySurplus", errors);
  if (!checked.ok || Object.keys(errors).length > 0) return invalid(errors);

  const cashflow = goalCashflowInput(cif, now);
  const surplus = estimated ?? averageSurplus(cashflow.months).value;
  const { targetAmount, targetDate, flexibility } = checked.value;
  const feasibility = {
    ...assessFeasibility({ targetAmount, currentAmount, targetDate, now, surplus }),
    source: estimated === null ? ("estimated" as const) : ("self_reported" as const),
  };
  const levers = buildLevers({
    feasibility,
    flexibility,
    targetAmount,
    currentAmount,
    now,
    categoryAverages: cashflow.categoryAverages,
  });
  return NextResponse.json({ surplus, feasibility, levers });
}
