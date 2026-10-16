/** Build Financials fixtures for insight tests. */

import type { CashflowResult, NetWorthResult } from "@/domain/engine";
import type { Financials } from "@/state/useFinancials";

const META = {
  period: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.000Z", label: "06/2026" },
  sourceCoverage: { sources: ["mock" as const], knownCount: 0, unknownCount: 0 },
  freshness: "2026-06-20T00:00:00.000Z",
};

export function makeCashflow(over: Partial<CashflowResult> = {}): CashflowResult {
  const byCategory = over.byCategory ?? [];
  return {
    income: over.income ?? 0,
    expense: over.expense ?? byCategory.reduce((s, c) => s + c.amount, 0),
    net: over.net ?? (over.income ?? 0) - (over.expense ?? 0),
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
    jarLines: over.jarLines ?? [],
    jarIncomeBasis: over.jarIncomeBasis ?? { value: "unknown", source: "estimated" },
  };
}
