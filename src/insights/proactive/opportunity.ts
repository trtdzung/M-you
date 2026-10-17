import type { Account, Goal, Liability } from "@/domain/models";
import type { Financials } from "@/domain/engine/finance-compose";
import type { ProactiveCandidate } from "./core";

/** Demo discovery thresholds; not a statement of customer eligibility or a rate. */
export const OPPORTUNITY_POLICY = {
  minimumAccountReserve: 10_000_000, // MSB M–Sinh lời linked-account minimum
  minimumSweep: 1_000_000,          // MSB M–Sinh lời transfer minimum
  certificateMinimum: 11_000_000,   // MSB FAQ: minimum participation amount
  highCostDebtRate: 0.20,           // conservative prototype suppression policy
  minimumSafetyBuffer: 10_000_000,
  spendBufferMonths: 2,
  debtReserveMonths: 3,
  goalReserveMonths: 3,
} as const;

const DAY = 86_400_000;
function daysTo(date: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const dateMs = Date.UTC(year, month - 1, day);
  const parsed = new Date(dateMs);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  const vn = new Date(now.getTime() + 7 * 60 * 60_000);
  const today = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate());
  return Math.round((dateMs - today) / DAY);
}

function nonNegativeVnd(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export interface OpportunityInput {
  fin: Financials;
  accounts: Account[];
  liabilities: Liability[];
  goals: Goal[];
  now: Date;
}

/** Fail closed on incomplete account, jar, debt, goal, or spend history. */
export function productOpportunityCandidate(input: OpportunityInput): ProactiveCandidate | null {
  const { fin, accounts, liabilities, goals, now } = input;
  const current = accounts.filter((a) => a.type === "current" && a.currency === "VND");
  if (current.length === 0 || current.some((a) => !nonNegativeVnd(a.availableBalance))) return null;
  const casaAvailable = current.reduce((sum, a) => sum + a.availableBalance, 0);
  if (!Number.isSafeInteger(casaAvailable) || casaAvailable < OPPORTUNITY_POLICY.minimumAccountReserve + OPPORTUNITY_POLICY.minimumSweep) return null;

  const spendJars = fin.jarBudget.lines.filter((l) => l.categoryIds.length > 0);
  if (spendJars.length === 0 || spendJars.some((l) => l.limitState !== "set" ||
      !nonNegativeVnd(l.limit) || !Number.isSafeInteger(l.balance) || (l.balance as number) < 0 ||
      l.spent > (l.limit as number) * 0.8)) return null;
  const jarReserved = spendJars.reduce((sum, l) => sum + Math.max(0, l.balance as number), 0);
  if (!Number.isSafeInteger(jarReserved)) return null;

  const monthlySpend = Math.max(fin.cashflow.expense, fin.prevCashflow.expense);
  if (!nonNegativeVnd(monthlySpend) || fin.prevCashflow.expense <= 0) return null;
  const safetyBuffer = Math.max(OPPORTUNITY_POLICY.minimumSafetyBuffer,
    monthlySpend * OPPORTUNITY_POLICY.spendBufferMonths);
  if (!Number.isSafeInteger(safetyBuffer)) return null;

  let debtReserved = 0;
  for (const debt of liabilities) {
    if (!nonNegativeVnd(debt.outstandingPrincipal) || !nonNegativeVnd(debt.minimumPayment) ||
        debt.interestRate === null || !Number.isFinite(debt.interestRate) ||
        debt.dueDate === null || daysTo(debt.dueDate, now) === null) return null;
    if (debt.outstandingPrincipal === 0) continue;
    if ((daysTo(debt.dueDate, now) as number) < 0) return null;
    if (debt.interestRate >= OPPORTUNITY_POLICY.highCostDebtRate) return null;
    // Reserve several instalments; do not pretend total long-term principal is due now.
    debtReserved += Math.min(debt.outstandingPrincipal,
      debt.minimumPayment * OPPORTUNITY_POLICY.debtReserveMonths);
  }
  if (!Number.isSafeInteger(debtReserved)) return null;

  let goalReserved = 0;
  let nearGoal = false;
  for (const goal of goals) {
    if (!nonNegativeVnd(goal.targetAmount) || !nonNegativeVnd(goal.currentAmount)) return null;
    const gap = Math.max(0, goal.targetAmount - goal.currentAmount);
    if (gap === 0) continue;
    if (!goal.targetDate) {
      // Without a due date, no defensible payment pace exists: protect the full gap.
      goalReserved += gap;
      nearGoal = true;
      continue;
    }
    const days = daysTo(goal.targetDate, now);
    if (days === null) return null;
    if (days <= 90) {
      goalReserved += gap;
      nearGoal = true;
    } else {
      const monthlyNeed = Math.ceil(gap / Math.max(1, Math.ceil(days / 30)));
      goalReserved += Math.min(gap, monthlyNeed * OPPORTUNITY_POLICY.goalReserveMonths);
    }
  }
  if (!Number.isSafeInteger(goalReserved)) return null;

  const protectedTotal = jarReserved + debtReserved + goalReserved + safetyBuffer;
  const safeSurplus = casaAvailable - protectedTotal;
  if (!Number.isSafeInteger(safeSurplus) || safeSurplus < OPPORTUNITY_POLICY.minimumSweep) return null;
  const products = ["m_sinh_loi"];
  if (!nearGoal && safeSurplus >= OPPORTUNITY_POLICY.certificateMinimum) products.push("msb_certificate");
  const accountFreshness = current.map((a) => a.lastSyncedAt).sort().at(0) ?? null;
  return {
    id: `safe_surplus_products:${fin.monthKey}`,
    insightType: "safe_surplus_products",
    period: fin.monthKey,
    priorityClass: "P4",
    severity: "info",
    semanticState: products.join("+"),
    metrics: {
      casa_available: casaAvailable,
      jar_reserved: jarReserved,
      debt_reserved: debtReserved,
      goal_reserved: goalReserved,
      safety_buffer: safetyBuffer,
      safe_surplus: safeSurplus,
      product_ids: products.join(","),
      debt_snapshot: JSON.stringify(liabilities.map((d) => [d.id, d.outstandingPrincipal, d.minimumPayment, d.interestRate, d.dueDate]).sort()),
      goal_snapshot: JSON.stringify(goals.map((g) => [g.id, g.targetAmount, g.currentAmount, g.targetDate]).sort()),
      source: "sqlite_demo",
      freshness: accountFreshness,
    },
    action: "explore_products",
  };
}
