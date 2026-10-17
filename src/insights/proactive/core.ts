/** Pure v1 Home insight primitives. No I/O, LLM, or UI state. */
import type { JarBudgetResult } from "@/domain/engine/jar-budget";
import type { Financials } from "@/domain/engine/finance-compose";
import type { Liability } from "@/domain/models";
import { dateToMonthKey } from "@/domain/engine/types";

export type PriorityClass = "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
export type Severity = "urgent" | "attention" | "info";

export interface ProactiveCandidate {
  id: string;
  insightType: string;
  period: string;
  priorityClass: PriorityClass;
  severity: Severity;
  semanticState: string;
  metrics: Record<string, string | number | null>;
  action: "review_jars" | "review_payments" | "review_spending" | "review_goals" | "explore_products" | "none";
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `Liability.dueDate` is date-only in current fixtures: compare VN calendar days. */
function daysUntilDue(dueDate: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const dueDay = Date.UTC(year, month - 1, day);
  const normalized = new Date(dueDay);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 ||
      normalized.getUTCDate() !== day) return null;
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const today = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate());
  return Math.round((dueDay - today) / 86_400_000);
}

/** A reminder about a known minimum payment, not a liquidity-shortfall claim. */
export function knownPaymentCandidates(liabilities: Liability[], now: Date): ProactiveCandidate[] {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return [];
  const period = dateToMonthKey(now);
  return liabilities.flatMap((o) => {
    if (o.minimumPayment === null || o.dueDate === null ||
        !Number.isSafeInteger(o.minimumPayment) || o.minimumPayment <= 0) return [];
    const days = daysUntilDue(o.dueDate, now);
    if (days === null || days < 0 || days > 30) return [];
    return [{
      id: `known_payment_due:${o.id}:${o.dueDate}`,
      insightType: "known_payment_due_reminder",
      period,
      priorityClass: "P0" as const,
      severity: days <= 7 ? "urgent" as const : "attention" as const,
      semanticState: days <= 7 ? "due_soon" : "upcoming",
      metrics: { obligation_id: o.id, obligation_label: o.name, minimum_payment: o.minimumPayment,
        due_date: o.dueDate, days_until_due: days, source: o.source, last_updated_at: o.lastUpdatedAt },
      action: "review_payments" as const,
    }];
  });
}

/** Existing jar-budget output is the only amount source; no independent jar balance. */
export function jarPlanCandidates(
  monthKey: string,
  jarBudget: JarBudgetResult,
  now: Date,
): ProactiveCandidate[] {
  if (dateToMonthKey(now) !== monthKey) return [];
  return jarBudget.lines.flatMap((line) => {
    if (line.limitState !== "set" || line.limit === null || line.balance === null) return [];
    if (![line.limit, line.spent, line.balance, line.rebalanceNet].every(Number.isSafeInteger) ||
        line.limit < 0 || !Number.isSafeInteger(jarBudget.summary.daysLeft) || jarBudget.summary.daysLeft < 0) return [];
    const unfunded = line.balance < 0;
    const over = line.spent > line.limit;
    const near = line.limit > 0 && line.spent / line.limit >= 0.8;
    if (!unfunded && !over && !near) return [];
    const state = unfunded ? "needs_cover" : over ? "over_limit_covered" : "near_limit";
    return [{
      id: `jar_plan_pressure:${monthKey}:${line.huId}`,
      insightType: "jar_plan_pressure",
      period: monthKey,
      priorityClass: "P1" as const,
      severity: unfunded ? "urgent" as const : "attention" as const,
      semanticState: state,
      metrics: {
        jar_id: line.huId,
        jar_label: line.label,
        budget_limit: line.limit,
        spent: line.spent,
        remaining: line.balance,
        rebalance_net: line.rebalanceNet,
        days_left: jarBudget.summary.daysLeft,
        source: line.source,
        freshness: line.freshness,
      },
      action: "review_jars" as const,
    }];
  });
}

/** Same posted net-spend boundary as the existing spending-spike detector. */
export function spendingPressureCandidates(fin: Financials): ProactiveCandidate[] {
  const previous = new Map(fin.prevCashflow.byCategory.map((c) => [c.categoryId, c.amount]));
  return fin.cashflow.byCategory.flatMap((c) => {
    const prior = previous.get(c.categoryId) ?? 0;
    const delta = c.amount - prior;
    if (!Number.isSafeInteger(c.amount) || !Number.isSafeInteger(prior) || prior <= 0 ||
        c.amount <= prior * 1.3 || delta < 500_000) return [];
    return [{
      id: `spending_spike:${fin.monthKey}:${c.categoryId}`,
      insightType: "spending_spike",
      period: fin.monthKey,
      priorityClass: "P2" as const,
      severity: "attention" as const,
      semanticState: "increased",
      metrics: {
        category_id: c.categoryId,
        category_label: fin.categoryLabels.get(c.categoryId) ?? c.categoryId,
        current_spend: c.amount,
        previous_spend: prior,
        increase: delta,
        source: fin.cashflow.meta.sourceCoverage.sources.join(","),
        freshness: fin.cashflow.meta.freshness,
      },
      action: "review_spending" as const,
    }];
  });
}

const PRIORITY: Record<PriorityClass, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
const SEVERITY: Record<Severity, number> = { urgent: 0, attention: 1, info: 2 };

/** Suppression runs before top-N selection; ties are stable by id. */
export function resolvePriority(candidates: ProactiveCandidate[], limit = 1): ProactiveCandidate[] {
  const highRisk = candidates.some((c) => c.priorityClass === "P0" || c.priorityClass === "P1");
  return candidates
    .filter((c) => !(highRisk && (c.priorityClass === "P4" || c.priorityClass === "P5")))
    .sort((a, b) => PRIORITY[a.priorityClass] - PRIORITY[b.priorityClass] ||
      SEVERITY[a.severity] - SEVERITY[b.severity] || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
