import { NextRequest, NextResponse } from "next/server";
import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { agentAlias } from "../advisor/agent-identity";
import {
  DIALOGUE_ACTIONS,
  NARRATION_DEADLINE_MS,
  PLAN_IDS,
  VERDICTS,
  isSafeNarration,
  type NarrateResult,
} from "../advisor/narration-contract";
import { badBody, cifOf, missingCif, readJson } from "./_http";

const local = (reason: string): NextResponse => NextResponse.json({ source: "local", reason } satisfies NarrateResult & { reason: string });
const isStr = (x: unknown): x is string => typeof x === "string";

/** Server-side switch: force the built-in templates (demo fallback, no model call). */
function templateOnly(): boolean {
  return ["1", "true", "on"].includes((process.env.GOAL_ADVISOR_TEMPLATE_ONLY ?? "").toLowerCase());
}

/** POST /api/goals/advisor/narrate — LLM sentences (with placeholders) for an analysis; never an error to the customer. */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return badBody();
  const cif = cifOf(body.cif);
  if (!cif) return missingCif();
  const mode = body.mode;
  const goalName = isStr(body.goalName) && body.goalName.length <= 40 ? body.goalName : null;
  let payload: Record<string, unknown>;
  if (mode === "explain" && VERDICTS.includes(body.verdict as never) && Array.isArray(body.planIds) && body.planIds.length > 0 && body.planIds.every((p) => PLAN_IDS.includes(p as never))) {
    payload = {
      mode,
      verdict: body.verdict,
      plan_ids: body.planIds,
      category_names: Array.isArray(body.categoryNames) ? body.categoryNames.filter(isStr).slice(0, 5) : [],
      facts: { goal_name: goalName },
    };
  } else if (mode === "converse" && DIALOGUE_ACTIONS.includes(body.action as never)) {
    payload = { mode, action: body.action, facts: { goal_name: goalName } };
  } else {
    return NextResponse.json({ error: "invalid narrate request" }, { status: 422 });
  }
  if (templateOnly()) return local("template_only");

  const started = Date.now();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), NARRATION_DEADLINE_MS));
  const call = forwardToAgent("/goal-coach/narrate", { user_id: agentAlias(cif), ...payload }).then((r) => (r.ok ? r.json().catch(() => null) : null)).catch(() => null);
  const data: unknown = await Promise.race([call, timeout]);
  const ms = Date.now() - started;
  const blocks = (data as { blocks?: unknown } | null)?.blocks;
  const source = (data as { source?: unknown } | null)?.source;
  if (!Array.isArray(blocks) || (source !== "llm" && source !== "template") || !blocks.every((b) => b && isStr(b.id) && isSafeNarration(b.text))) {
    console.info(`[goal-advisor] narrate local ms=${ms}`);
    return local(data === null ? "unavailable" : "invalid");
  }
  console.info(`[goal-advisor] narrate ${source} ms=${ms}`);
  return NextResponse.json({ source, blocks: blocks.map((b) => ({ id: b.id, text: b.text })) } satisfies NarrateResult);
}
