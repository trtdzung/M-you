import { NextRequest, NextResponse } from "next/server";
import { seedDemoGoals } from "../server/demo-goals";
import { badBody, cifOf, missingCif, readJson } from "./_http";

/** POST /api/goals/demo — body { cif }. Adds backdated sample goals; safe to repeat. */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  return NextResponse.json(seedDemoGoals(cif), { status: 201 });
}
