import type { UiPayload } from "./agent-api";

/**
 * The agent's `plan_roadmap` card: ONE block holding up to three savings/loan plans, each a timeline of milestones, with a
 * "Chọn phương án này" button per choosable plan (it sends `choice_text` as the customer's next chat message). All figures
 * are computed by the agent's code. The guard checks SHAPE and limits only (never throws).
 */

export type PlanId = "no_loan" | "loan_now" | "optimized";
export type PlanVerdict = "recommended" | "ok" | "late" | "not_recommended";
export type MilestoneKind = "reserve" | "save" | "switch" | "buy" | "loan" | "repay" | "done";

export interface PlanMetric {
  label: string;
  value: string;
}
export interface PlanMilestone {
  when: string;
  kind: MilestoneKind;
  title: string;
  detail?: string;
  action?: string;
}
export interface PlanOption {
  id: PlanId;
  name: string;
  verdict: PlanVerdict;
  headline: string;
  reason?: string;
  metrics: PlanMetric[];
  milestones: PlanMilestone[];
  risk?: string;
  choice_text?: string;
}
export interface PlanRoadmapUi {
  type: "plan_roadmap";
  title: string;
  baseline: string;
  assumptions: string[];
  plans: PlanOption[];
}

const PLAN_IDS = new Set(["no_loan", "loan_now", "optimized"]);
const VERDICTS = new Set(["recommended", "ok", "late", "not_recommended"]);
const KINDS = new Set(["reserve", "save", "switch", "buy", "loan", "repay", "done"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Non-blank string of 1..max chars. */
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && Array.from(v).length <= max;
/** Absent (or undefined) or a string of at most `max` chars (blank allowed only when absent). */
const optStr = (v: unknown, max: number): boolean => v === undefined || str(v, max);
const only = (f: Record<string, unknown>, allowed: string[]) =>
  Object.entries(f).every(([k, v]) => v === undefined || allowed.includes(k));

function validMetric(m: unknown): boolean {
  return isObj(m) && only(m, ["label", "value"]) && str(m.label, 30) && str(m.value, 40);
}
function validMilestone(m: unknown): boolean {
  return (
    isObj(m) &&
    only(m, ["when", "kind", "title", "detail", "action"]) &&
    str(m.when, 30) &&
    typeof m.kind === "string" && KINDS.has(m.kind) &&
    str(m.title, 60) &&
    optStr(m.detail, 200) &&
    optStr(m.action, 120)
  );
}
function validPlan(p: unknown): boolean {
  if (!isObj(p)) return false;
  if (!only(p, ["id", "name", "verdict", "headline", "reason", "metrics", "milestones", "risk", "choice_text"])) return false;
  if (typeof p.id !== "string" || !PLAN_IDS.has(p.id)) return false;
  if (!str(p.name, 40) || !str(p.headline, 160)) return false;
  if (typeof p.verdict !== "string" || !VERDICTS.has(p.verdict)) return false;
  if (!optStr(p.reason, 200) || !optStr(p.risk, 240)) return false;
  if (!Array.isArray(p.metrics) || p.metrics.length > 4 || !p.metrics.every(validMetric)) return false;
  if (!Array.isArray(p.milestones) || p.milestones.length > 10 || !p.milestones.every(validMilestone)) return false;
  if (p.verdict === "not_recommended") {
    return p.reason !== undefined && p.choice_text === undefined;
  }
  return p.milestones.length >= 1 && str(p.choice_text, 120);
}

export function isPlanRoadmapUi(ui: UiPayload | null | undefined): ui is PlanRoadmapUi {
  try {
    if (!isObj(ui) || ui.type !== "plan_roadmap") return false;
    const c = ui as Record<string, unknown>;
    if (!only(c, ["type", "title", "baseline", "assumptions", "plans"])) return false;
    if (!str(c.title, 80) || !str(c.baseline, 200)) return false;
    if (!Array.isArray(c.assumptions) || c.assumptions.length > 8 || !c.assumptions.every((a) => str(a, 80))) return false;
    if (!Array.isArray(c.plans) || c.plans.length < 1 || c.plans.length > 3 || !c.plans.every(validPlan)) return false;
    const plans = c.plans as PlanOption[];
    if (new Set(plans.map((p) => p.id)).size !== plans.length) return false;
    return plans.filter((p) => p.verdict === "recommended").length <= 1;
  } catch {
    return false;
  }
}
