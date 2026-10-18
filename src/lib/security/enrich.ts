import "server-only";

import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { readProfile } from "./profile-store";
import { getIntervention, recordAgentTrace, setAgentCopy } from "./intervention-store";
import type { Intervention, InterventionCopy } from "./intervention-types";
import type { ScenarioLevel } from "./scenario-copy";

type Result = { level: ScenarioLevel; scenario: string; message: string; question: string | null; chips: string[]; matched_playbook: string | null; trace: { tool: string; elapsed_ms: number; result: string }[] };
const ranks = { green: 0, yellow: 1, red: 2 };
function valid(value: unknown, rule: Intervention): value is Result {
  if (!value || typeof value !== "object") return false;
  const r = value as Result;
  return Object.keys(r).every(k => ["level", "scenario", "message", "question", "chips", "matched_playbook", "trace"].includes(k))
    && r.level in ranks && ranks[r.level] >= ranks[rule.level] && r.scenario === rule.scenario
    && typeof r.message === "string" && r.message.trim().length > 0 && r.message.length <= 1200
    && (r.question === null || typeof r.question === "string" && r.question.length <= 400)
    && Array.isArray(r.chips) && r.chips.length <= 8 && r.chips.every(c => rule.copy.chips.includes(c))
    && (r.matched_playbook === null || typeof r.matched_playbook === "string" && r.matched_playbook.length <= 80)
    && Array.isArray(r.trace) && r.trace.length <= 30 && r.trace.every(t => t && typeof t.tool === "string" && t.tool.length <= 80 && Number.isInteger(t.elapsed_ms) && t.elapsed_ms >= 0 && ["ok", "no_data", "error"].includes(t.result));
}

/** Fire after storing the rule; model latency never delays the initial warning. */
export function enrich(cif: string, id: string): void {
  const rule = getIntervention(cif, id);
  if (!rule || !(rule.level !== "green" || rule.scenario.startsWith("BT"))) return;
  if (!readProfile(cif).aiProtect) { setAgentCopy(cif, id, "off"); return; }
  setAgentCopy(cif, id, "pending");
  void complete(cif, id, rule);
}

async function complete(cif: string, id: string, rule: Intervention): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      forwardToAgent("/fraud/intervene", { intervention_id: id, cif }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 7_000); }),
    ]);
    if (!response.ok) throw new Error("agent failed");
    const result: unknown = await response.json();
    if (!valid(result, rule)) throw new Error("invalid response");
    if (!readProfile(cif).aiProtect) { setAgentCopy(cif, id, "off"); return; }
    const copy: InterventionCopy = { message: result.message, question: result.question, chips: result.chips, emphasis: [] };
    setAgentCopy(cif, id, "ready", copy, result.level);
    recordAgentTrace(cif, id, { status: "ready", matched_playbook: result.matched_playbook, trace: result.trace });
  } catch {
    setAgentCopy(cif, id, "failed");
    recordAgentTrace(cif, id, { status: "failed", matched_playbook: null, trace: [] });
  } finally { if (timer) clearTimeout(timer); }
}
