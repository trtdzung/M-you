import "server-only";
import { getDb } from "@/lib/db";
import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { clipOutput, recordAiJournal, toolNames } from "./ai-journal";
import { fraudAgentEnabled } from "./fraud-switch";
import { redactSecurityText } from "./redact";
import { readProfile } from "./profile-store";
import { CLASSIFY_QUESTIONS } from "./scenario-copy";

export type Diagnosis = { answers: string[]; pending: boolean; next_question: string | null; conclusion: string | null; proposals: string[]; source: "rule" | "agent"; trace: unknown[] };
const initial = (): Diagnosis => ({ answers: [], pending: false, next_question: CLASSIFY_QUESTIONS[0], conclusion: null, proposals: [], source: "rule", trace: [] });
function row(cif: string, id: string) {
  const db = getDb();
  const intervention = db.prepare("SELECT context FROM interventions WHERE cif=? AND id=?").get(cif, id) as { context: string } | undefined;
  if (intervention) return { table: "interventions", column: "context", data: JSON.parse(intervention.context) };
  const hold = db.prepare("SELECT review FROM transfer_holds WHERE cif=? AND id=? AND status='holding'").get(cif, id) as { review: string } | undefined;
  return hold ? { table: "transfer_holds", column: "review", data: JSON.parse(hold.review) } : null;
}
export function readDiagnosis(cif: string, id: string): Diagnosis | null {
  const r = row(cif, id);
  if (!r) return null;
  const state: Diagnosis = r.data.diagnosis ?? initial();
  if (fraudAgentEnabled() || state.source !== "agent") return state;
  const next = state.answers.length < CLASSIFY_QUESTIONS.length ? CLASSIFY_QUESTIONS[state.answers.length] : null;
  return { ...state, source: "rule", next_question: next, conclusion: null, proposals: [], trace: [] };
}
function save(cif: string, id: string, state: Diagnosis): void {
  const r = row(cif, id);
  if (!r) return;
  r.data.diagnosis = state;
  getDb().prepare(`UPDATE ${r.table} SET ${r.column}=? WHERE cif=? AND id=?`).run(JSON.stringify(r.data), cif, id);
}

/** Persist each answer before invoking the model; concurrent submissions cannot add questions. */
export async function diagnose(cif: string, id: string, answer: string): Promise<Diagnosis | null> {
  const state = readDiagnosis(cif, id);
  if (!state || state.pending || state.answers.length >= 2) return null;
  state.answers.push(redactSecurityText(answer));
  state.pending = true;
  save(cif, id, state);
  const fallback = { ...state, pending: false, next_question: state.answers.length < 2 ? CLASSIFY_QUESTIONS[1] : null, conclusion: null, proposals: [], source: "rule" as const, trace: [] };
  if (!readProfile(cif).aiProtect || !fraudAgentEnabled()) { save(cif, id, fallback); return fallback; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      forwardToAgent("/fraud/diagnose", { intervention_id: id, answer: state.answers.at(-1) }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 7_000); }),
    ]);
    const result = response.ok ? await response.json().catch(() => null) : null;
    const tools = toolNames(result?.trace);
    const shaped = !!result && typeof result === "object" && Object.keys(result).every(k => ["next_question", "conclusion", "proposals", "trace"].includes(k))
      && (result.next_question === null || typeof result.next_question === "string" && result.next_question.length <= 400)
      && (result.conclusion === null || typeof result.conclusion === "string" && result.conclusion.length <= 800)
      && Array.isArray(result.proposals) && result.proposals.length <= 3 && result.proposals.every((p: string) => ["callback", "emergency_lock", "case", "none"].includes(p))
      && Array.isArray(result.trace) && result.trace.length <= 30 && !(state.answers.length >= 2 && result.next_question !== null);
    if (!shaped) {
      recordAiJournal(cif, "diagnose", id, tools, "thất bại");
      save(cif, id, fallback);
      return fallback;
    }
    recordAiJournal(cif, "diagnose", id, tools, clipOutput(result.conclusion || result.next_question || "thành công"));
    if (!readProfile(cif).aiProtect || !fraudAgentEnabled()) { save(cif, id, fallback); return fallback; }
    const next: Diagnosis = { ...state, ...result, pending: false, source: "agent" };
    save(cif, id, next);
    return next;
  } catch {
    recordAiJournal(cif, "diagnose", id, "", "thất bại");
    save(cif, id, fallback);
    return fallback;
  } finally { if (timer) clearTimeout(timer); }
}
