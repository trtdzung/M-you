import "server-only";

/** Read/write the `interventions` table (Scam Shield engine). Server only. */

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { ScenarioId, ScenarioLevel, Surface } from "./scenario-copy";
import type { ShownBefore } from "./scenarios";
import type { AgentStatus, Intervention, InterventionCopy, InterventionStatus, InterventionTarget } from "./intervention-types";

interface Row {
  id: string;
  cif: string;
  scenario: ScenarioId;
  level: ScenarioLevel;
  surface: Surface;
  target: InterventionTarget;
  dedupe_key: string | null;
  status: InterventionStatus;
  context: string;
  copy_rule: string;
  copy_agent: string | null;
  agent_status: AgentStatus;
  countdown_sec: number | null;
  created_at: number;
  shown_at: number | null;
  answered_at: number | null;
  choice: string | null;
}

export type StoredContext = {
  scenarios: ScenarioId[];
  classify: boolean;
  evidence: { code: string; evidence: string }[];
  /** Frequency key (recipient, sender…) and anything the agent or UI needs later. */
  key: string | null;
  facts?: Record<string, unknown>;
};

export type NewIntervention = {
  cif: string;
  scenario: ScenarioId;
  level: ScenarioLevel;
  surface: Surface;
  target: InterventionTarget;
  dedupeKey: string | null;
  context: StoredContext;
  copy: InterventionCopy;
  countdownSec: number | null;
  createdAt: number;
};

function parse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function toIntervention(row: Row): Intervention {
  const context = parse<StoredContext>(row.context, { scenarios: [row.scenario], classify: false, evidence: [], key: null });
  const agent = row.agent_status === "ready" ? parse<InterventionCopy | null>(row.copy_agent, null) : null;
  return {
    id: row.id,
    scenario: row.scenario,
    scenarios: context.scenarios,
    level: row.level,
    surface: row.surface,
    target: row.target,
    status: row.status,
    copy: agent ?? parse<InterventionCopy>(row.copy_rule, { message: "", question: null, chips: [], emphasis: [] }),
    source: agent ? "agent" : "rule",
    agentStatus: row.agent_status,
    countdownSec: row.countdown_sec,
    classify: context.classify,
    evidence: context.evidence,
    createdAt: row.created_at,
    choice: row.choice,
  };
}

export function insertIntervention(input: NewIntervention): Intervention {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO interventions (id, cif, scenario, level, surface, target, dedupe_key, status, context, copy_rule, countdown_sec, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    )
    .run(id, input.cif, input.scenario, input.level, input.surface, input.target, input.dedupeKey,
      JSON.stringify(input.context), JSON.stringify(input.copy), input.countdownSec, input.createdAt);
  return getIntervention(input.cif, id)!;
}

export function getIntervention(cif: string, id: string): Intervention | null {
  const row = getDb().prepare("SELECT * FROM interventions WHERE cif = ? AND id = ?").get(cif, id) as Row | undefined;
  return row ? toIntervention(row) : null;
}

export function getInterventionContext(cif: string, id: string): StoredContext | null {
  const row = getDb().prepare("SELECT context FROM interventions WHERE cif = ? AND id = ?").get(cif, id) as { context: string } | undefined;
  return row ? parse<StoredContext | null>(row.context, null) : null;
}

/** Open (pending or shown) interventions, newest first; optionally for one target. */
export function openInterventions(cif: string, target?: string): Intervention[] {
  const rows = (target
    ? getDb().prepare("SELECT * FROM interventions WHERE cif = ? AND target = ? AND status IN ('pending', 'shown') ORDER BY created_at DESC").all(cif, target)
    : getDb().prepare("SELECT * FROM interventions WHERE cif = ? AND status IN ('pending', 'shown') ORDER BY created_at DESC").all(cif)) as Row[];
  return rows.map(toIntervention);
}

export function findOpenByDedupe(cif: string, dedupeKey: string): Intervention | null {
  const row = getDb()
    .prepare("SELECT * FROM interventions WHERE cif = ? AND dedupe_key = ? AND status IN ('pending', 'shown') ORDER BY created_at DESC LIMIT 1")
    .get(cif, dedupeKey) as Row | undefined;
  return row ? toIntervention(row) : null;
}

/** Close every open intervention on a target (e.g. the draft changed). */
export function expireOpen(cif: string, target: string, exceptId?: string): void {
  getDb()
    .prepare("UPDATE interventions SET status = 'expired' WHERE cif = ? AND target = ? AND status IN ('pending', 'shown') AND id <> ?")
    .run(cif, target, exceptId ?? "");
}

export function markShown(cif: string, id: string, at: number): boolean {
  const { changes } = getDb()
    .prepare("UPDATE interventions SET status = 'shown', shown_at = COALESCE(shown_at, ?) WHERE cif = ? AND id = ? AND status IN ('pending', 'shown')")
    .run(at, cif, id);
  return changes > 0;
}

export function markAnswered(cif: string, id: string, choice: string, at: number): boolean {
  const { changes } = getDb()
    .prepare("UPDATE interventions SET status = 'answered', answered_at = ?, shown_at = COALESCE(shown_at, ?), choice = ? WHERE cif = ? AND id = ? AND status IN ('pending', 'shown')")
    .run(at, at, choice, cif, id);
  return changes > 0;
}

export function setAgentCopy(cif: string, id: string, status: AgentStatus, copy?: InterventionCopy, level?: ScenarioLevel): void {
  getDb()
    .prepare("UPDATE interventions SET agent_status = ?, copy_agent = COALESCE(?, copy_agent), level = COALESCE(?, level) WHERE cif = ? AND id = ?")
    .run(status, copy ? JSON.stringify(copy) : null, level ?? null, cif, id);
}

/** History for the frequency rules: every intervention shown, answered, or still waiting to show. */
export function shownHistory(cif: string): ShownBefore[] {
  const rows = getDb()
    .prepare("SELECT scenario, context, shown_at, created_at, choice FROM interventions WHERE cif = ? AND status IN ('pending', 'shown', 'answered')")
    .all(cif) as Pick<Row, "scenario" | "context" | "shown_at" | "created_at" | "choice">[];
  return rows.map(row => ({
    scenario: row.scenario,
    at: row.shown_at ?? row.created_at,
    key: parse<StoredContext | null>(row.context, null)?.key ?? null,
    confirmed: row.choice !== null && /tiếp tục|tôi tự chuyển/i.test(row.choice),
  }));
}

/** Test tools: forget every intervention of a persona (frequency resets with it). */
export function clearInterventions(cif: string, scenario?: string): void {
  if (scenario) getDb().prepare("DELETE FROM interventions WHERE cif = ? AND scenario = ?").run(cif, scenario);
  else getDb().prepare("DELETE FROM interventions WHERE cif = ?").run(cif);
}
