/**
 * Health slide facts: the engine's Financial Health Score as of today (NOT a recap
 * of the window — its period says so). Numbers are copied from the score result,
 * never recomputed (invariant #1); a pillar without a score stays `"unknown"` (#6).
 * The slide is dropped when the engine could not produce an overall score.
 */

import { lowestTrust } from "@/domain/engine/provenance";
import type { Period } from "@/domain/engine/types";
import type { DataSource } from "@/domain/models";
import type { FinancialHealthScoreResult, HealthPillar } from "@/domain/models/health-score";
import { latestOf, makeFact } from "./wrapped-fact";
import type { WrappedFact, WrappedSlide } from "./wrapped-types";

/** Fixed pillar order on the slide. */
export const HEALTH_PILLARS: readonly HealthPillar[] = ["SPEND", "SAVE", "BORROW", "PLAN_PROTECT"];

export const HEALTH_SCORE_ASSUMPTION =
  "Điểm tính đến hôm nay, cùng cách tính với thẻ Sức khỏe tài chính trên Trang chủ; không phải điểm trung bình 6 tháng";

/** "2026-09-15" or an ISO instant -> a point-in-time period labelled "Tính đến 15/09/2026". */
function asOfPeriod(asOf: string): Period {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(asOf)?.[0];
  const iso = day ? new Date(`${day}T00:00:00+07:00`).toISOString() : asOf;
  const label = day ? `Tính đến ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : "Tính đến hôm nay";
  return { from: iso, to: iso, label };
}

export function healthSlide(score: FinancialHealthScoreResult | null | undefined): WrappedSlide {
  if (!score || score.overallScore === null || score.tier === null) {
    return { id: "health", available: false, facts: [] };
  }
  const computable = score.metrics.filter((m) => m.score !== null);
  const provenance = {
    source: lowestTrust(
      computable.map((m) => m.source).filter((s): s is DataSource => s !== "derived"),
    ),
    freshness: latestOf(computable.map((m) => m.asOf)),
  };
  const period = asOfPeriod(score.computedAt);
  const facts: WrappedFact[] = [
    makeFact("health-score", score.overallScore, "score", period, provenance, HEALTH_SCORE_ASSUMPTION),
    makeFact("health-tier", score.tier, "text", period, provenance),
    makeFact("health-coverage", Math.round(score.scoreCoverage * 100), "pct", period, provenance, "Độ phủ dữ liệu của điểm"),
    ...HEALTH_PILLARS.map((p) =>
      makeFact(`health-pillar.${p}`, score.pillarScores[p] ?? "unknown", "score", period, provenance),
    ),
  ];
  return { id: "health", available: true, facts };
}
