/**
 * Monthly advisory brief — the deterministic composer behind the Báo cáo dock.
 *
 * Pure function over engine facts (`Financials`) + the existing rule-based
 * detectors: NO LLM, NO network. Grounding is by construction — the brief only
 * ever surfaces numbers the engine already produced (invariant #1), and every
 * item carries its provenance (source + freshness, invariant #5). Guidance is
 * non-committing: each action is a whitelisted navigation intent, never a money
 * movement (invariant #3).
 *
 * Insufficient-data months are exempt from the "≥1 actionable" gate (red-team
 * #12): they return an honest message with NO fabricated action.
 */

import type { DataSource } from "@/domain/models";
import type { Financials } from "@/state/useFinancials";
import type { Insight } from "@/insights/types";
import type { CopilotIntent } from "@/lib/copilot-nav";
import { runDetectors } from "@/insights/run";
import { formatVnd } from "@/lib/format";
import { advisoryFor, type BriefBand } from "./advisory-copy";

/** A deep-link "nên làm gì" CTA — resolved via `resolveIntentRoute` in the UI. */
export interface BriefAction {
  label: string;
  intentId: CopilotIntent;
}

/** A light top-line finding (positives / risks) — grounded, no CTA. */
export interface BriefFinding {
  title: string;
  detail: string;
  source: DataSource;
  freshness: string | null;
}

/** A behavioral highlight: detector evidence + templated meaning + action CTA. */
export interface BriefHighlight {
  insight: Insight;
  band: BriefBand;
  meaning: string;
  action: BriefAction;
  source: DataSource;
  freshness: string | null;
}

export interface MonthlyBrief {
  monthKey: string;
  /** False when the period has no underlying transaction data (invariant #6). */
  sufficientData: boolean;
  /** Honest message shown ONLY when `sufficientData` is false. */
  emptyMessage: string | null;
  positives: BriefFinding[];
  risks: BriefFinding[];
  highlights: BriefHighlight[];
  actions: BriefAction[];
}

const INSUFFICIENT_MESSAGE =
  "Chưa đủ dữ liệu để lập báo cáo cho kỳ này. Khi có giao dịch, MSB sẽ tóm tắt hành vi chi tiêu và gợi ý cho bạn.";

/** Magnitude thresholds (VND) for the copy band. */
const HIGH = 5_000_000;
const MEDIUM = 2_000_000;

/** The money value that best characterizes a detector's magnitude. */
function magnitude(insight: Insight): number {
  const get = (label: string) => {
    const f = insight.sourceFacts.find((x) => x.label === label);
    return typeof f?.value === "number" ? Math.abs(f.value) : 0;
  };
  switch (insight.type) {
    case "spending_spike":
    case "income_change":
      return get("Chênh lệch");
    case "jar_pressure":
      return get("Vượt");
    case "upcoming_obligation":
      return get("Số tiền");
    case "recurring_summary":
      return get("Tổng ước tính mỗi tháng");
    case "budget_pressure":
      return Math.max(0, get("Đã chi") - get("Hạn mức"));
    default: {
      const nums = insight.sourceFacts
        .map((f) => (typeof f.value === "number" ? Math.abs(f.value) : 0));
      return nums.length ? Math.max(...nums) : 0;
    }
  }
}

function bandOf(insight: Insight): BriefBand {
  const m = magnitude(insight);
  if (m >= HIGH) return "high";
  if (m >= MEDIUM) return "medium";
  return "low";
}

/** Deduplicate CTAs by (intent + params) so the summary list stays tight. */
function dedupeActions(actions: BriefAction[]): BriefAction[] {
  const seen = new Set<string>();
  const out: BriefAction[] = [];
  for (const a of actions) {
    const key = a.intentId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * A grounded fallback CTA so a data-rich but detector-quiet month still meets the
 * "≥1 actionable" gate — derived from the month's own net cash flow, never filler.
 */
function fallbackAction(f: Financials): BriefAction {
  return f.cashflow.net > 0
    ? { label: "Phân bổ khoản dư vào các hũ", intentId: "open-hu" }
    : { label: "Xem lại chi tiêu để cân đối dòng tiền", intentId: "open-hu" };
}

/** Compose the deterministic monthly brief. Identical inputs → identical output. */
export function composeMonthlyBrief(f: Financials): MonthlyBrief {
  const source: DataSource = f.cashflow.meta.sourceCoverage.sources[0] ?? "mock";
  const freshness = f.cashflow.meta.freshness;

  // Insufficient data → honest message, never a fabricated action (red-team #12).
  if (freshness === null) {
    return {
      monthKey: f.monthKey,
      sufficientData: false,
      emptyMessage: INSUFFICIENT_MESSAGE,
      positives: [],
      risks: [],
      highlights: [],
      actions: [],
    };
  }

  const positives: BriefFinding[] = [];
  const risks: BriefFinding[] = [];
  const highlights: BriefHighlight[] = [];

  if (f.cashflow.net > 0) {
    positives.push({
      title: "Dòng tiền dương",
      detail: `Tháng này bạn thu nhiều hơn chi ${formatVnd(f.cashflow.net)}.`,
      source,
      freshness,
    });
  }

  for (const insight of runDetectors(f)) {
    // Income increase is good news — a positive, not an action-needing highlight.
    if (insight.type === "income_change" && insight.severity === "info") {
      positives.push({ title: insight.title, detail: insight.explanation, source, freshness });
      continue;
    }

    const band = bandOf(insight);
    const copy = advisoryFor(insight.type, band);
    if (!copy) continue; // no template for this type → not a templated highlight

    highlights.push({
      insight,
      band,
      meaning: copy.meaning,
      action: { label: copy.action, intentId: copy.intentId },
      source,
      freshness,
    });

    if (insight.severity !== "info") {
      risks.push({ title: insight.title, detail: insight.explanation, source, freshness });
    }
  }

  const actions = dedupeActions(highlights.map((h) => h.action));
  if (actions.length === 0) actions.push(fallbackAction(f));

  return {
    monthKey: f.monthKey,
    sufficientData: true,
    emptyMessage: null,
    positives,
    risks,
    highlights,
    actions,
  };
}
