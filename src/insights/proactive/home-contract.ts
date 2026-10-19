import type { SnapshotCandidate } from "./snapshot";
import type { FinancialHealthScoreResult, HealthPillar } from "@/domain/models/health-score";

export interface HomeInsight {
  snapshotId: string;
  candidate: SnapshotCandidate;
  title: string;
  body: string;
  source: "agent" | "fallback";
  asOf: string;
}

export interface PillarAssessment {
  pillar: HealthPillar;
  status: "strength" | "watch" | "insufficient_data";
  explanation: string;
}

export interface HealthScoreAssessment {
  snapshotId: string;
  source: "agent";
  summary: string;
  pillarAssessments: PillarAssessment[];
  strengths: string[];
  areasToWatch: string[];
  recommendedActions: string[];
  dataLimitations: string[];
}

export interface HomeInsightCarouselResult {
  snapshotId: string;
  asOf: string;
  healthScore: FinancialHealthScoreResult;
  healthAssessment: HealthScoreAssessment | null;
  insights: HomeInsight[]; // up to the top 2 candidates, deterministic order
  insight: HomeInsight | null; // legacy alias for insights[0] ?? null
  cached: boolean;
  reason?: "no_candidate" | "dismissed";
}

/** Legacy alias so existing callers and tests remain fully compatible */
export type HomeInsightResult = HomeInsightCarouselResult;

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

const VALID_PILLARS = new Set<HealthPillar>(["SPEND", "SAVE", "BORROW", "PLAN_PROTECT"]);
const VALID_STATUSES = new Set<string>(["strength", "watch", "insufficient_data"]);

export function validHealthScoreAssessment(value: unknown, snapshotId: string): HealthScoreAssessment | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const sid = r.snapshotId ?? r.snapshot_id;
  if (sid !== snapshotId) return null;
  if (r.source !== "agent") return null;
  if (typeof r.summary !== "string" || !r.summary.trim() || r.summary.length > 600) return null;

  const rawPillars = Array.isArray(r.pillarAssessments ?? r.pillar_assessments)
    ? (r.pillarAssessments ?? r.pillar_assessments) as unknown[]
    : [];

  const pillarAssessments: PillarAssessment[] = [];
  for (const item of rawPillars) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const pillar = p.pillar as HealthPillar;
    const status = p.status as "strength" | "watch" | "insufficient_data";
    const explanation = typeof p.explanation === "string" ? p.explanation.trim() : "";
    if (VALID_PILLARS.has(pillar) && VALID_STATUSES.has(status) && explanation.length > 0 && explanation.length <= 400) {
      pillarAssessments.push({ pillar, status, explanation });
    }
  }

  const toStringArray = (val: unknown): string[] => {
    if (!Array.isArray(val)) return [];
    return val
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= 300)
      .slice(0, 10);
  };

  const strengths = toStringArray(r.strengths);
  const areasToWatch = toStringArray(r.areasToWatch ?? r.areas_to_watch);
  const recommendedActions = toStringArray(r.recommendedActions ?? r.recommended_actions);
  const dataLimitations = toStringArray(r.dataLimitations ?? r.data_limitations);

  return {
    snapshotId,
    source: "agent",
    summary: r.summary.trim(),
    pillarAssessments,
    strengths,
    areasToWatch,
    recommendedActions,
    dataLimitations,
  };
}
