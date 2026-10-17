import type { SnapshotCandidate } from "./snapshot";

export interface HomeInsight {
  snapshotId: string;
  candidate: SnapshotCandidate;
  title: string;
  body: string;
  source: "agent" | "fallback";
  asOf: string;
}
export interface HomeInsightResult {
  insight: HomeInsight | null;
  reason?: "no_candidate" | "dismissed";
  cached: boolean;
}
export function validAgentSelection(value: unknown, snapshotId: string, candidates: SnapshotCandidate[]) {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const topPriority = Math.min(...candidates.map((c) => c.priority));
  const candidate = candidates.find((c) => c.id === r.candidate_id && c.priority === topPriority);
  if (r.snapshot_id !== snapshotId || !candidate || typeof r.title !== "string" || typeof r.body !== "string" ||
    !r.title.trim() || !r.body.trim() || r.title.length > 70 || r.body.length > 240 ||
    /\p{N}|https?:|```/iu.test(r.title + r.body)) return null;
  return { candidate, title: r.title, body: r.body };
}
