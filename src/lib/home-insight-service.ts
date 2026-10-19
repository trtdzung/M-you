import "server-only";
import { getDb } from "./db";
import { AGENT_BASE_URL, agentAuthHeaders } from "./agent-proxy-auth";
import { customerSnapshot } from "./financial-snapshot-service";
import {
  validAgentSelection,
  type HomeInsight,
  type HomeInsightCarouselResult,
} from "@/insights/proactive/home-contract";
import { selectOrderedHomeCandidates, type SnapshotCandidate } from "@/insights/proactive/snapshot";

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
      secondaryInsights: [],
      insight: null,
      reason: "dismissed",
      cached: true,
    };
  }

  if (row && row.expires_at > Date.now()) {
    try {
      const parsed = JSON.parse(row.card_json);
      if (parsed && Array.isArray(parsed.insights) && parsed.healthScore) {
        return {
          ...parsed,
          healthAssessment: null,
          secondaryInsights: parsed.secondaryInsights ?? parsed.insights,
          cached: true,
        };
      }
    } catch {
      /* rebuild corrupt cache */
    }
  }

  const key = `${cif}:${snapshotId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<HomeInsightCarouselResult> => {
    // Extract up to 5 candidates preserving deterministic priority order & [Security Đỏ/Vàng] -> [PFM] -> [Security Xanh]
    const distinctCandidates: SnapshotCandidate[] = [];
    const seenIds = new Set<string>();
    for (const c of snapshot.candidates) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        distinctCandidates.push(c);
      }
    }
    const topCandidates = selectOrderedHomeCandidates(distinctCandidates).slice(0, 5);

    if (topCandidates.length === 0) {
      const emptyResult: HomeInsightCarouselResult = {
        snapshotId,
        asOf: snapshot.asOf,
        healthScore: snapshot.healthScore,
        healthAssessment: null,
        insights: [],
        secondaryInsights: [],
        insight: null,
        reason: "no_candidate",
        cached: false,
      };
      db.prepare(`INSERT INTO home_insight_cache (cif, snapshot_id, card_json, expires_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(cif, snapshot_id) DO UPDATE SET card_json=excluded.card_json, expires_at=excluded.expires_at`)
        .run(cif, snapshotId, JSON.stringify(emptyResult), Date.now() + 60_000);
      return emptyResult;
    }

    const insights: HomeInsight[] = topCandidates.map((cand) => ({
      snapshotId,
      candidate: cand,
      title: cand.title,
      body: cand.body,
      asOf: snapshot.asOf,
      source: "fallback",
      domain: cand.domain,
      securityLevel: cand.securityLevel,
      scenarioCode: cand.scenarioCode,
      category: cand.category,
      categoryLabel: cand.categoryLabel,
      slotGroup: cand.slotGroup,
      tone: cand.tone,
      impactLine: cand.impactLine,
      badgeText: cand.badgeText,
      progressPct: cand.progressPct,
      chips: cand.chips,
      primaryAction: cand.primaryAction,
      actionType: cand.actionType,
      actionHref: cand.actionHref,
      actionLabel: cand.actionLabel ?? cand.primaryAction?.label,
    }));

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
            body: JSON.stringify({
              snapshot_id: snapshotId,
              snapshot,
              prompt_guidelines: {
                title: "Ngắn gọn, đi thẳng vào con số + sự kiện (<= 70 ký tự)",
                summary: "Nêu rõ hệ quả và hướng xử lý trong 1-2 câu ngắn, tự nhiên, thân thiện (<= 240 ký tự)",
                zero_hallucination: "Không thay đổi hoặc sáng tạo bất kỳ con số nào ngoài candidate gốc",
              },
            }),
            cache: "no-store",
            signal,
          }
        );
        if (!response.ok) throw new Error(`upstream_status_${response.status}`);
        const data = await response.json();
        const selection = validAgentSelection(data, snapshotId, snapshot.candidates);
        return { selection };
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
          if (agentResult.selection.selected && Array.isArray(agentResult.selection.selected)) {
            for (const item of agentResult.selection.selected) {
              const idx = insights.findIndex((i) => i.candidate.id === item.candidate.id);
              if (idx !== -1) {
                insights[idx] = { ...insights[idx], ...item, source: "agent" };
              }
            }
          } else if (insights.length > 0) {
            insights[0] = { ...insights[0], ...agentResult.selection, source: "agent" };
          }
          hasAgentSuccess = true;
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    } catch {
      /* Deterministic fallback cards remain available */
    }

    const carouselResult: HomeInsightCarouselResult = {
      snapshotId,
      asOf: snapshot.asOf,
      healthScore: snapshot.healthScore,
      healthAssessment: null,
      insights,
      secondaryInsights: insights,
      insight: insights[0] ?? null,
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
