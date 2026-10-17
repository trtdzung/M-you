import { NextRequest, NextResponse } from "next/server";
import { transferNow } from "@/lib/demo-clock";
import { validateGoalCreate } from "../model/validate-goal";
import { analyze } from "../advisor/analyze";
import { buildAdvisorContext } from "../advisor/context";
import { badBody, cifOf, invalid, missingCif, readJson } from "./_http";

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** POST /api/goals/advisor — read-only analysis of a draft against the customer's real numbers. */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  if (!isObj(body.draft)) return invalid({ draft: "Thiếu nháp mục tiêu" });
  const overrides = isObj(body.overrides) ? body.overrides : {};
  const now = transferNow();

  const merged = {
    ...body.draft,
    ...(overrides.targetDate !== undefined ? { targetDate: overrides.targetDate } : {}),
    ...(overrides.targetAmount !== undefined ? { targetAmount: overrides.targetAmount } : {}),
    monthlyContribution: null,
  };
  const checked = validateGoalCreate(merged, now);
  if (!checked.ok) return invalid(checked.errors);
  const v = checked.value;
  const analysis = analyze(
    {
      name: v.name,
      targetAmount: v.targetAmount,
      targetDate: v.targetDate,
      flexibility: v.flexibility,
      openingAmount: v.openingAmount ?? 0,
    },
    buildAdvisorContext(cif, now),
    now,
  );
  return NextResponse.json(analysis);
}
