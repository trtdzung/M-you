import { NextRequest, NextResponse } from "next/server";
import { forwardToAgent } from "@/lib/agent-proxy-auth";

/**
 * Same-origin proxy to the agent's `POST /goal-suggestions`, for manual testing only
 * (the app itself calls the agent from `goals-preview/server/suggestions/agent-wording.ts`).
 * The body is the agent's request (`user_id`, `today`, `customer`, `goals`, `signals`, `feedback`);
 * only the top-level shape is checked here, the agent validates the rest.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    typeof body.user_id !== "string" || !body.user_id ||
    typeof body.today !== "string" ||
    typeof body.customer !== "object" || body.customer === null ||
    !Array.isArray(body.signals)
  ) {
    return NextResponse.json({ error: "user_id, today, customer and signals[] are required" }, { status: 422 });
  }
  return forwardToAgent("/goal-suggestions", {
    user_id: body.user_id,
    today: body.today,
    customer: body.customer,
    goals: Array.isArray(body.goals) ? body.goals : [],
    signals: body.signals,
    feedback: Array.isArray(body.feedback) ? body.feedback : [],
  });
}
