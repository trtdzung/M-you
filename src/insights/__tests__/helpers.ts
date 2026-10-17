/** Build Financials fixtures for insight tests. */

import type {
  CashflowResult,
  FinancialHealth,
  HealthIndicator,
  JarBudgetLine,
  JarBudgetResult,
  JarEnvelopeResult,
  NetWorthResult,
} from "@/domain/engine";
import type { Financials } from "@/state/useFinancials";

const META = {
  period: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.000Z", label: "06/2026" },
  sourceCoverage: { sources: ["mock" as const], knownCount: 0, unknownCount: 0 },
  freshness: "2026-06-20T00:00:00.000Z",
};

export function makeCashflow(over: Partial<CashflowResult> = {}): CashflowResult {
  const byCategory = over.byCategory ?? [];
  const expense = over.expense ?? byCategory.reduce((s, c) => s + c.amount, 0);
  const income = over.income ?? 0;
  return {
    income,
    expense,
    net: over.net ?? income - expense,
    byCategory,
    fixed: over.fixed ?? 0,
    discretionary: over.discretionary ?? 0,
    pendingExpense: over.pendingExpense ?? 0,
    meta: over.meta ?? META,
  };
}

const NETWORTH: NetWorthResult = {
  total: 0, assetsTotal: 0, liabilitiesTotal: 0, breakdown: [], unknownFields: [], hasUnknown: false,
  meta: { ...META, period: { from: "", to: "", label: "Hiện tại" } },
};

const EMPTY_JAR_BUDGET: JarBudgetResult = {
  lines: [],
  summary: {
    totalLimit: null,
    totalSpent: 0,
    totalSpentSet: 0,
    totalRebalanceNet: 0,
    totalRemaining: null,
    pctUsed: null,
    daysLeft: 0,
    setCount: 0,
    unsetCount: 0,
  },
  meta: META,
};

/** An empty envelope result — no CASA account, no funded jars. */
const EMPTY_JAR_ENVELOPE: JarEnvelopeResult = {
  pending: { amount: "unknown", overAllocated: false, pool: "unknown", allocated: 0, meta: META },
  jars: [],
  meta: META,
};

/** A full JarBudgetResult, defaulted to empty (no lines, nothing set). */
export function makeJarBudgetResult(over: Partial<JarBudgetResult> = {}): JarBudgetResult {
  return {
    lines: over.lines ?? EMPTY_JAR_BUDGET.lines,
    summary: over.summary ?? EMPTY_JAR_BUDGET.summary,
    meta: over.meta ?? EMPTY_JAR_BUDGET.meta,
  };
}

/**
 * A single jarBudget line, defaulted to an unset (no-limit) jar with no spend.
 *
 * `remaining` (the BALANCE axis) defaults to what the engine would derive —
 * `limit − spent + rebalanceNet` — instead of `null`, so a fixture cannot describe a
 * jar the engine can never produce (e.g. `status: "over"` with a null balance). Pass
 * it explicitly to model a jar that a rebalance moved off that identity.
 */
export function makeJarBudgetLine(over: Partial<JarBudgetLine> = {}): JarBudgetLine {
  const limit = over.limit ?? null;
  const spent = over.spent ?? 0;
  const rebalanceNet = over.rebalanceNet ?? 0;
  return {
    huId: over.huId ?? "food",
    label: over.label ?? "Ăn uống",
    categoryIds: over.categoryIds ?? ["dining"],
    spent,
    prevSpent: over.prevSpent ?? 0,
    momDelta: over.momDelta ?? 0,
    momPct: over.momPct ?? null,
    limit,
    limitState: over.limitState ?? "unset",
    rebalanceNet,
    remaining: over.remaining ?? (limit !== null ? limit - spent + rebalanceNet : null),
    pct: over.pct ?? null,
    status: over.status ?? null,
    thresholdHit: over.thresholdHit ?? false,
    source: over.source ?? "mock",
    freshness: over.freshness ?? null,
  };
}

/** All-null health indicator — the safe default when a fixture omits inputs. */
const NULL_INDICATOR: HealthIndicator = {
  value: null,
  band: null,
  source: "estimated",
  freshness: null,
  hasUnknown: false,
};

const EMPTY_HEALTH: FinancialHealth = {
  runwayMonths: NULL_INDICATOR,
  concentration: NULL_INDICATOR,
};

export function makeFinancials(over: Partial<Financials> = {}): Financials {
  return {
    monthKey: over.monthKey ?? "2026-06",
    cashflow: over.cashflow ?? makeCashflow(),
    prevCashflow: over.prevCashflow ?? makeCashflow(),
    networth: over.networth ?? NETWORTH,
    budgetLines: over.budgetLines ?? [],
    categorySpend: over.categorySpend ?? [],
    recurring: over.recurring ?? [],
    obligations: over.obligations ?? [],
    endOfMonth: over.endOfMonth ?? { value: 0, meta: { source: "estimated", freshness: null } },
    runway: over.runway ?? { months: null, meta: { source: "estimated", freshness: null } },
    networthCurrent: over.networthCurrent ?? null,
    networthPrevious: over.networthPrevious ?? null,
    networthSeries: over.networthSeries ?? [],
    networthSeriesMeta: over.networthSeriesMeta ?? { source: null, count: 0, freshness: null },
    jarBudget: over.jarBudget ?? EMPTY_JAR_BUDGET,
    jarEnvelope: over.jarEnvelope ?? EMPTY_JAR_ENVELOPE,
    unallocatedPool: over.unallocatedPool ?? { amount: 0, overAllocated: false, source: "mock" },
    jarRebalances: over.jarRebalances ?? [],
    unlabeled: over.unlabeled ?? { count: 0, amount: 0, source: "mock" },
    health: over.health ?? EMPTY_HEALTH,
    goals: over.goals ?? [],
    categoryLabels: over.categoryLabels ?? new Map(),
  };
}
