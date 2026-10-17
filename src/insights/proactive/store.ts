import type Database from "better-sqlite3";
import { decideCache, featureFingerprint, semanticSignature } from "./cache";
import type { ProactiveCandidate } from "./core";
import { deterministicCopy, toWidgetDto, type InsightWidgetDto, type WidgetCopy } from "./widget";

const RULE_VERSION = "home-v1";

interface InsightRow {
  cif: string;
  insight_id: string;
  version: number;
  status: "active" | "resolved" | "superseded" | "dismissed" | "expired";
  fingerprint: string;
  semantic_signature: string;
  candidate_json: string;
  copy_json: string;
}

export interface SyncResult {
  insight: InsightWidgetDto | null;
  cache: "exact_reuse" | "copy_reuse" | "new_version" | "dismissed" | "no_candidate";
}

function latest(db: Database.Database, cif: string, id: string): InsightRow | undefined {
  return db.prepare(
    "SELECT * FROM proactive_insights WHERE cif = ? AND insight_id = ? ORDER BY version DESC LIMIT 1",
  ).get(cif, id) as InsightRow | undefined;
}

function copyFrom(row: InsightRow): WidgetCopy | null {
  try {
    const value = JSON.parse(row.copy_json) as WidgetCopy;
    if (typeof value.title === "string" && typeof value.body === "string" &&
        !/\p{N}/u.test(value.title + value.body)) return value;
  } catch { /* regenerate if corrupt */ }
  return null;
}

/** Reconcile one top candidate atomically. Exact hits perform no write and no LLM call. */
export function syncSelectedInsight(
  db: Database.Database,
  cif: string,
  candidate: ProactiveCandidate | null,
  now: string,
): SyncResult {
  return db.transaction((): SyncResult => {
    if (!candidate) {
      db.prepare("UPDATE proactive_insights SET status = 'resolved', updated_at = ? WHERE cif = ? AND status = 'active'")
        .run(now, cif);
      return { insight: null, cache: "no_candidate" };
    }
    const fingerprint = featureFingerprint(cif, RULE_VERSION, candidate);
    const signature = semanticSignature(RULE_VERSION, candidate);
    const previous = latest(db, cif, candidate.id);
    const previousCopy = previous ? copyFrom(previous) : null;
    const decision = decideCache(previous ? {
      fingerprint: previous.fingerprint,
      semanticSignature: previous.semantic_signature,
      reusableCopy: previousCopy !== null,
    } : null, { fingerprint, semanticSignature: signature });

    db.prepare("UPDATE proactive_insights SET status = 'resolved', updated_at = ? WHERE cif = ? AND status = 'active' AND insight_id <> ?")
      .run(now, cif, candidate.id);

    if (decision === "exact_reuse" && previous) {
      if (previous.status === "dismissed") return { insight: null, cache: "dismissed" };
      if (previous.status === "active" && previousCopy) {
        return { insight: toWidgetDto(candidate, previousCopy, previous.version), cache: "exact_reuse" };
      }
    }

    if (previous?.status === "active") {
      db.prepare("UPDATE proactive_insights SET status = 'superseded', updated_at = ? WHERE cif = ? AND insight_id = ? AND version = ?")
        .run(now, cif, candidate.id, previous.version);
    }
    const copy = decision === "copy_reuse" && previousCopy ? previousCopy : deterministicCopy(candidate);
    const version = (previous?.version ?? 0) + 1;
    db.prepare(`INSERT INTO proactive_insights
      (cif, insight_id, version, insight_type, status, fingerprint, semantic_signature,
       candidate_json, copy_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`).run(
      cif, candidate.id, version, candidate.insightType, fingerprint, signature,
      JSON.stringify(candidate), JSON.stringify(copy), now, now,
    );
    return { insight: toWidgetDto(candidate, copy, version),
      cache: decision === "copy_reuse" ? "copy_reuse" : "new_version" };
  })();
}

/** Guard interaction writes against stale cards and cross-persona events. */
export function recordInsightEvent(
  db: Database.Database,
  cif: string,
  id: string,
  version: number,
  event: "displayed" | "dismissed",
  now: string,
): boolean {
  return db.transaction(() => {
    const row = db.prepare("SELECT status FROM proactive_insights WHERE cif = ? AND insight_id = ? AND version = ?")
      .get(cif, id, version) as { status: string } | undefined;
    if (!row || row.status !== "active") return false;
    db.prepare("INSERT OR IGNORE INTO proactive_insight_events (cif, insight_id, version, event_type, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(cif, id, version, event, now);
    if (event === "dismissed") db.prepare(
      "UPDATE proactive_insights SET status = 'dismissed', updated_at = ? WHERE cif = ? AND insight_id = ? AND version = ?",
    ).run(now, cif, id, version);
    return true;
  })();
}
