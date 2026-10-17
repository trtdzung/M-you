import "server-only";
import { getDb } from "./db";
import { AGENT_BASE_URL, agentAuthHeaders } from "./agent-proxy-auth";
import { customerSnapshot } from "./financial-snapshot-service";
import { validAgentSelection, type HomeInsight, type HomeInsightResult } from "@/insights/proactive/home-contract";

const inFlight = new Map<string, Promise<HomeInsight>>();
function storage() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS home_insight_cache (
    cif TEXT NOT NULL, snapshot_id TEXT NOT NULL, card_json TEXT NOT NULL, expires_at INTEGER NOT NULL,
    dismissed_until INTEGER NOT NULL DEFAULT 0, displayed_at INTEGER,
    PRIMARY KEY (cif, snapshot_id)
  )`);
  return db;
}
export async function generateHomeInsight(cif: string, input: unknown): Promise<HomeInsightResult> {
  const { snapshot, snapshotId } = customerSnapshot(cif, input);
  if (!snapshot.candidates.length) return { insight: null, reason: "no_candidate", cached: false };
  const db = storage();
  const row = db.prepare("SELECT * FROM home_insight_cache WHERE cif = ? AND snapshot_id = ?").get(cif, snapshotId) as
    { card_json: string; expires_at: number; dismissed_until: number } | undefined;
  if (row && row.dismissed_until > Date.now()) return { insight: null, reason: "dismissed", cached: true };
  if (row && row.expires_at > Date.now()) {
    try { return { insight: JSON.parse(row.card_json), cached: true }; } catch { /* rebuild corrupt cache */ }
  }
  const key = `${cif}:${snapshotId}`;
  const existing = inFlight.get(key);
  if (existing) return { insight: await existing, cached: true };
  const task = (async (): Promise<HomeInsight> => {
    let card: HomeInsight = { snapshotId, candidate: snapshot.candidates[0], title: snapshot.candidates[0].title,
      body: snapshot.candidates[0].body, asOf: snapshot.asOf, source: "fallback" };
    try {
      const signal = AbortSignal.timeout(20_000);
      const request = async () => {
        const headers = process.env.AGENT_PROACTIVE_API_URL
          ? { "X-API-Key": process.env.AGENT_API_KEY || "", "Content-Type": "application/json" }
          : await agentAuthHeaders({ "Content-Type": "application/json" });
        const response = await fetch(process.env.AGENT_PROACTIVE_API_URL || `${AGENT_BASE_URL.replace(/\/$/, "")}/proactive-insights`, {
          method: "POST", headers, body: JSON.stringify({ snapshot_id: snapshotId, snapshot }), cache: "no-store", signal,
        });
        if (!response.ok) throw new Error(`upstream_status_${response.status}`);
        return validAgentSelection(await response.json(), snapshotId, snapshot.candidates);
      };
      let onAbort: () => void = () => {};
      try {
        const selection = await Promise.race([request(), new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error("timeout"));
          signal.addEventListener("abort", onAbort, { once: true });
        })]);
        if (selection) card = { ...card, ...selection, source: "agent" };
      } finally { signal.removeEventListener("abort", onAbort); }
    } catch { /* Independent deterministic card remains available. */ }
    db.prepare(`INSERT INTO home_insight_cache (cif, snapshot_id, card_json, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(cif, snapshot_id) DO UPDATE SET card_json=excluded.card_json, expires_at=excluded.expires_at`)
      .run(cif, snapshotId, JSON.stringify(card), Date.now() + (card.source === "agent" ? 30 * 60_000 : 60_000));
    db.prepare("DELETE FROM home_insight_cache WHERE expires_at < ? AND dismissed_until < ?")
      .run(Date.now() - 86_400_000, Date.now());
    return card;
  })();
  inFlight.set(key, task);
  try { return { insight: await task, cached: false }; }
  finally { inFlight.delete(key); }
}
export function homeInsightEvent(cif: string, snapshotId: string, event: "displayed" | "dismissed") {
  const db = storage();
  const sql = event === "dismissed" ? "UPDATE home_insight_cache SET dismissed_until = ? WHERE cif = ? AND snapshot_id = ?" :
    "UPDATE home_insight_cache SET displayed_at = COALESCE(displayed_at, ?) WHERE cif = ? AND snapshot_id = ?";
  return db.prepare(sql).run(Date.now() + (event === "dismissed" ? 86_400_000 : 0), cif, snapshotId).changes > 0;
}
