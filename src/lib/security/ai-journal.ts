import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { actionFor } from "./actions";
import { engineNow } from "./clock";
import { redactSecurityText } from "./redact";

export type AiJournalEntry = {
  id: string;
  at: number;
  agent: string;
  action: string;
  ref: string | null;
  dataUsed: string;
  output: string;
  customerDecision: string | null;
};

/** Tool names from an agent trace. Results are dropped so customer data never lands here. */
export function toolNames(trace: unknown): string {
  if (!Array.isArray(trace)) return "";
  const names: string[] = [];
  for (const item of trace) {
    if (!item || typeof item !== "object") continue;
    const tool = (item as { tool?: unknown }).tool;
    if (typeof tool !== "string" || !tool || tool.length > 80 || names.includes(tool)) continue;
    names.push(tool);
    if (names.length >= 30) break;
  }
  return names.join(", ");
}

export function clipOutput(text: string): string {
  const clean = redactSecurityText(text).replace(/\s+/g, " ").trim();
  return (clean || "thành công").slice(0, 240);
}

function decisionLabel(choice: string): "đồng ý" | "không" {
  const kind = actionFor(choice).kind;
  return kind === "proceed" || kind === "dismiss" ? "không" : "đồng ý";
}

function choiceFor(cif: string, ref: string | null): string | null {
  if (!ref) return null;
  const row = getDb().prepare("SELECT choice FROM interventions WHERE cif = ? AND id = ? AND choice IS NOT NULL").get(cif, ref) as { choice: string } | undefined;
  return row ? decisionLabel(row.choice) : null;
}

/** One row per agent call. `dataUsed` is tool names; `output` is redacted and short. */
export function recordAiJournal(cif: string, action: string, ref: string | null, dataUsed: string, output: string): void {
  getDb()
    .prepare(
      `INSERT INTO ai_journal (id, cif, at, agent, action, ref, data_used, output, customer_decision)
       VALUES (?, ?, ?, 'fraud', ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), cif, engineNow(cif).getTime(), action, ref, dataUsed.slice(0, 500), clipOutput(output), choiceFor(cif, ref));
}

/** The customer's chip on an intervention: đồng ý with the warning, or không. */
export function decideAiJournal(cif: string, ref: string, choice: string): void {
  getDb()
    .prepare("UPDATE ai_journal SET customer_decision = ? WHERE cif = ? AND ref = ? AND customer_decision IS NULL")
    .run(decisionLabel(choice), cif, ref);
}

export function listAiJournal(cif: string): AiJournalEntry[] {
  const rows = getDb()
    .prepare("SELECT id, at, agent, action, ref, data_used, output, customer_decision FROM ai_journal WHERE cif = ? ORDER BY at DESC, rowid DESC LIMIT 100")
    .all(cif) as { id: string; at: number; agent: string; action: string; ref: string | null; data_used: string; output: string; customer_decision: string | null }[];
  return rows.map(row => ({
    id: row.id, at: row.at, agent: row.agent, action: row.action, ref: row.ref,
    dataUsed: row.data_used, output: row.output, customerDecision: row.customer_decision,
  }));
}
