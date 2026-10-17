import { NextRequest, NextResponse } from "next/server";
import { forwardToAgent } from "@/lib/agent-proxy-auth";
import {
  COACH_ANSWERS_MAX,
  COACH_ANSWER_VALUE_MAX,
  COACH_REQUEST_MAX,
  isCoachResponse,
} from "../coach/contracts";
import { badBody, cifOf, missingCif, readJson } from "./_http";

const SLOTS = ["name", "target_amount", "horizon", "flexibility", "opening_amount"];
const unavailable = () => NextResponse.json({ error: "coach_unavailable" }, { status: 502 });

function validAnswers(answers: unknown): boolean {
  return (
    Array.isArray(answers) &&
    answers.length <= COACH_ANSWERS_MAX &&
    answers.every(
      (a) =>
        typeof a === "object" && a !== null &&
        SLOTS.includes((a as { slot?: string }).slot as string) &&
        typeof (a as { value?: unknown }).value === "string" &&
        (a as { value: string }).value.length >= 1 &&
        (a as { value: string }).value.length <= COACH_ANSWER_VALUE_MAX &&
        ["option", "text"].includes((a as { source?: string }).source as string),
    )
  );
}

/** POST /api/goals/coach — body { cif, request, answers } -> agent POST /goal-coach. */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  const request = typeof body.request === "string" ? body.request.trim() : "";
  const answers = body.answers ?? [];
  if (!request || request.length > COACH_REQUEST_MAX || !validAnswers(answers)) {
    return NextResponse.json({ error: "invalid coach request" }, { status: 422 });
  }

  const res = await forwardToAgent("/goal-coach", { user_id: cif, request, answers });
  if (!res.ok) return unavailable();
  const data: unknown = await res.json().catch(() => null);
  return isCoachResponse(data) ? NextResponse.json(data) : unavailable();
}
