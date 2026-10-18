import "server-only";

import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { saveCase, readCase } from "./case-store";
import { CASE_FIELDS, CASE_GUIDANCE } from "./case-types";
import { readProfile } from "./profile-store";

export type CaseTurn = { source: "rule" | "agent"; field: number; nextQuestion: string | null; guidance: string | null };

function ruleTurn(answers: string[]): CaseTurn {
  const field = answers.findIndex(value => !value.trim());
  const done = field < 0;
  return { source: "rule", field: done ? CASE_FIELDS.length : field, nextQuestion: done ? null : CASE_FIELDS[field], guidance: done ? CASE_GUIDANCE : null };
}

function agentTurn(value: unknown, answers: string[]): CaseTurn | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Object.keys(row).every(key => ["next_question", "dossier", "guidance", "trace"].includes(key))) return null;
  const field = answers.findIndex(item => !item.trim());
  const question = row.next_question;
  const guidance = row.guidance;
  if (field >= 0) {
    if (typeof question !== "string" || question.length > 400 || !question.toLowerCase().includes(CASE_FIELDS[field].toLowerCase())) return null;
    if (row.dossier !== null || guidance !== null) return null;
    return { source: "agent", field, nextQuestion: question, guidance: null };
  }
  const file = row.dossier;
  if (question !== null || typeof guidance !== "string" || guidance.length > 1000 || !guidance.includes("cơ quan công an")) return null;
  if (!file || typeof file !== "object") return null;
  const dossier = file as Record<string, unknown>;
  const limits = { time: 500, amount: 100, recipient: 500, channel: 500, image: 120 };
  if (Object.entries(limits).some(([key, max]) => typeof dossier[key] !== "string" || (dossier[key] as string).length > max || (dossier[key] as string).includes("data:image"))) return null;
  return { source: "agent", field: CASE_FIELDS.length, nextQuestion: null, guidance };
}

/** Ask the model for the next missing field. Any failure keeps the fixed rule question. */
export async function interviewCase(cif: string, id: string, answer: string | null): Promise<CaseTurn | null> {
  const item = readCase(cif, id);
  if (!item) return null;
  const rule = ruleTurn(item.answers);
  if (!readProfile(cif).aiProtect) return rule;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const payload: Record<string, unknown> = { case_id: id };
    if (answer !== null) payload.answer = answer;
    const response = await Promise.race([
      forwardToAgent("/fraud/case", payload),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 7_000); }),
    ]);
    if (!response.ok) return rule;
    const turn = agentTurn(await response.json(), item.answers);
    if (!turn || !readProfile(cif).aiProtect) return rule;
    if (turn.guidance) saveCase(cif, id, { guidance: turn.guidance });
    return turn;
  } catch {
    return rule;
  } finally { if (timer) clearTimeout(timer); }
}
