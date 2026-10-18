import { NextRequest, NextResponse } from "next/server";
import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { transferNow } from "@/lib/demo-clock";
import { agentAlias, agentContext } from "../advisor/agent-identity";
import {
  COACH_ANSWERS_MAX,
  COACH_ANSWER_VALUE_MAX,
  COACH_REQUEST_MAX,
  isCoachResponse,
} from "../coach/contracts";
import { badBody, cifOf, conversationIdOf, missingCif, readJson } from "./_http";

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

  const payload: Record<string, unknown> = { user_id: agentAlias(cif), request, answers };
  const conversationId = conversationIdOf(body.conversationId);
  if (conversationId) payload.conversation_id = conversationId;
  if (body.currentDraft !== undefined && body.currentDraft !== null) {
    const d = body.currentDraft as { target_amount?: unknown; opening_amount?: unknown; months?: unknown };
    const ok =
      typeof d === "object" && Number.isInteger(d.target_amount) && (d.target_amount as number) > 0 &&
      Number.isInteger(d.opening_amount) && (d.opening_amount as number) >= 0 &&
      (d.months === undefined || d.months === null || (Number.isInteger(d.months) && (d.months as number) >= 1 && (d.months as number) <= 600));
    if (!ok) return NextResponse.json({ error: "invalid coach request" }, { status: 422 });
    payload.current_draft = { target_amount: d.target_amount, opening_amount: d.opening_amount, months: d.months ?? null };
  }
  // Chips are shaped by the customer's real figures; only for a fresh goal (an edit of a draft needs none).
  if (!payload.current_draft) {
    const context = agentContext(cif, transferNow());
    if (context) payload.context = context;
  }
  const started = Date.now();
  const res = await forwardToAgent("/goal-coach", payload);
  const data: unknown = res.ok ? await res.json().catch(() => null) : null;
  const ok = isCoachResponse(data);
  console.info(`[goal-coach] conv=${conversationId ?? "-"} ${ok ? `${data.status}/${data.message_code} rid=${data.request_id}` : "unavailable"} ms=${Date.now() - started}`);
  return ok ? NextResponse.json(data) : unavailable();
}
