import "server-only";
import { getDb } from "./db";
import { AGENT_BASE_URL, agentAuthHeaders } from "./agent-proxy-auth";
import { customerSnapshot } from "./financial-snapshot-service";
import {
  validAgentSelection,
  validHealthScoreAssessment,
  type HomeInsight,
  type HomeInsightCarouselResult,
  type HealthScoreAssessment,
} from "@/insights/proactive/home-contract";
import type { SnapshotCandidate } from "@/insights/proactive/snapshot";

const inFlight = new Map<string, Promise<HomeInsightCarouselResult>>();

function storage() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS home_insight_cache (
    cif TEXT NOT NULL, snapshot_id TEXT NOT NULL, card_json TEXT NOT NULL, expires_at INTEGER NOT NULL,
    dismissed_until INTEGER NOT NULL DEFAULT 0, displayed_at INTEGER,
    PRIMARY KEY (cif, snapshot_id)
  )`);
  return db;
}

export async function generateHomeInsight(cif: string, input: unknown): Promise<HomeInsightCarouselResult> {
  const { snapshot, snapshotId } = customerSnapshot(cif, input);
  const db = storage();
  const row = db.prepare("SELECT * FROM home_insight_cache WHERE cif = ? AND snapshot_id = ?").get(cif, snapshotId) as
    { card_json: string; expires_at: number; dismissed_until: number } | undefined;

  if (row && row.dismissed_until > Date.now()) {
    return {
      snapshotId,
      asOf: snapshot.asOf,
      healthScore: snapshot.healthScore,
      healthAssessment: null,
      insights: [],
      insight: null,
      reason: "dismissed",
      cached: true,
    };
  }

  if (row && row.expires_at > Date.now()) {
    try {
      const parsed = JSON.parse(row.card_json);
      if (parsed && Array.isArray(parsed.insights) && parsed.healthScore) {
        return { ...parsed, cached: true };
      }
      // Rebuild legacy single-card cache
    } catch {
      /* rebuild corrupt cache */
    }
  }

  const key = `${cif}:${snapshotId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<HomeInsightCarouselResult> => {
    // Extract up to 2 distinct candidates preserving deterministic priority order
    const distinctCandidates: SnapshotCandidate[] = [];
    const seenIds = new Set<string>();
    for (const c of snapshot.candidates) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        distinctCandidates.push(c);
      }
    }
    const topTwo = distinctCandidates.slice(0, 2);

    if (topTwo.length === 0) {
      const emptyResult: HomeInsightCarouselResult = {
        snapshotId,
        asOf: snapshot.asOf,
        healthScore: snapshot.healthScore,
        healthAssessment: null,
        insights: [],
        insight: null,
        reason: "no_candidate",
        cached: false,
      };
      db.prepare(`INSERT INTO home_insight_cache (cif, snapshot_id, card_json, expires_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(cif, snapshot_id) DO UPDATE SET card_json=excluded.card_json, expires_at=excluded.expires_at`)
        .run(cif, snapshotId, JSON.stringify(emptyResult), Date.now() + 60_000);
      return emptyResult;
    }

    let primaryInsight: HomeInsight = {
      snapshotId,
      candidate: topTwo[0],
      title: topTwo[0].title,
      body: topTwo[0].body,
      asOf: snapshot.asOf,
      source: "fallback",
    };

    const secondaryInsight: HomeInsight | null = topTwo[1]
      ? {
          snapshotId,
          candidate: topTwo[1],
          title: topTwo[1].title,
          body: topTwo[1].body,
          asOf: snapshot.asOf,
          source: "fallback",
        }
      : null;

    let assessment: HealthScoreAssessment | null = null;
    let hasAgentSuccess = false;

    try {
      const signal = AbortSignal.timeout(20_000);
      const request = async () => {
        const headers = process.env.AGENT_PROACTIVE_API_URL
          ? { "X-API-Key": process.env.AGENT_API_KEY || "", "Content-Type": "application/json" }
          : await agentAuthHeaders({ "Content-Type": "application/json" });
        const response = await fetch(
          process.env.AGENT_PROACTIVE_API_URL || `${AGENT_BASE_URL.replace(/\/$/, "")}/proactive-insights`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ snapshot_id: snapshotId, snapshot }),
            cache: "no-store",
            signal,
          }
        );
        if (!response.ok) throw new Error(`upstream_status_${response.status}`);
        const data = await response.json();
        const selection = validAgentSelection(data, snapshotId, snapshot.candidates);
        const parsedAssessment = validHealthScoreAssessment(
          data?.health_score_assessment ?? data?.healthAssessment,
          snapshotId
        );
        return { selection, assessment: parsedAssessment };
      };

      let onAbort: () => void = () => {};
      try {
        const agentResult = await Promise.race([
          request(),
          new Promise<never>((_, reject) => {
            onAbort = () => reject(new Error("timeout"));
            signal.addEventListener("abort", onAbort, { once: true });
          }),
        ]);
        if (agentResult.selection) {
          primaryInsight = { ...primaryInsight, ...agentResult.selection, source: "agent" };
          hasAgentSuccess = true;
        }
        if (agentResult.assessment) {
          assessment = agentResult.assessment;
          hasAgentSuccess = true;
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    } catch {
      /* Deterministic fallback cards remain available */
    }

    const insights: HomeInsight[] = [primaryInsight, ...(secondaryInsight ? [secondaryInsight] : [])];

    const carouselResult: HomeInsightCarouselResult = {
      snapshotId,
      asOf: snapshot.asOf,
      healthScore: snapshot.healthScore,
      healthAssessment: assessment,
      insights,
      insight: primaryInsight,
      cached: false,
    };

    const ttl = hasAgentSuccess ? 30 * 60_000 : 60_000;
    db.prepare(`INSERT INTO home_insight_cache (cif, snapshot_id, card_json, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(cif, snapshot_id) DO UPDATE SET card_json=excluded.card_json, expires_at=excluded.expires_at`)
      .run(cif, snapshotId, JSON.stringify(carouselResult), Date.now() + ttl);

    db.prepare("DELETE FROM home_insight_cache WHERE expires_at < ? AND dismissed_until < ?")
      .run(Date.now() - 86_400_000, Date.now());

    return carouselResult;
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

export function homeInsightEvent(cif: string, snapshotId: string, event: "displayed" | "dismissed") {
  const db = storage();
  const sql =
    event === "dismissed"
      ? "UPDATE home_insight_cache SET dismissed_until = ? WHERE cif = ? AND snapshot_id = ?"
      : "UPDATE home_insight_cache SET displayed_at = COALESCE(displayed_at, ?) WHERE cif = ? AND snapshot_id = ?";
  return (
    db
      .prepare(sql)
      .run(Date.now() + (event === "dismissed" ? 86_400_000 : 0), cif, snapshotId).changes > 0
  );
}
