import "server-only";

import { liveTxns } from "@/app/api/jars/jar-write-guards";
import { aggregateCashflow, inPeriod } from "@/domain/engine/cashflow";
import { casaBalanceOrUnknown } from "@/domain/engine/casa-balance";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { jarSpendable } from "@/domain/engine/jar-spendable";
import { addMonthsToKey, dateToMonthKey, monthPeriodFromKey } from "@/domain/engine/types";
import type { Account, Transaction } from "@/domain/models";
import { readAccounts } from "@/lib/accounts-store";
import { readCategories } from "@/lib/categories-store";
import { readJarConfig } from "@/lib/jars-store";
import type { CategoryAverage } from "../engine/levers/cut-category";
import { averageSurplus } from "../engine/surplus";
import { goalCashflowInput } from "../server/cashflow-input";
import { loadGoalView } from "../server/goal-view";
import { listGoals, resumeExpiredPauses } from "../server/goals-repo";
import { computeHealth } from "./health";
import { computeSignals } from "./signals";
import type { AdvisorContext, AdvisorGoal, AdvisorMonth, Amount } from "./types";

const MONTHS_BACK = 6;
const HEALTH_MONTHS = 3;
const DAYS_PER_MONTH = 30;
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { at: number; value: AdvisorContext }>();

export function clearAdvisorContextCache(): void {
  cache.clear();
}

const mean = (sum: number, n: number): Amount => (n > 0 ? Math.round(sum / n) : "unknown");
const sumOf = (accounts: Account[], type: Account["type"], pick: (a: Account) => number): number | null => {
  const rows = accounts.filter((a) => a.type === type);
  return rows.length === 0 ? null : rows.reduce((s, a) => s + pick(a), 0);
};

/** Everything the advisor needs about one customer, derived by the engine. Cached per cif+month. */
export function buildAdvisorContext(cif: string, now: Date): AdvisorContext {
  const asOfMonth = dateToMonthKey(now);
  const key = `${cif}|${asOfMonth}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = compute(cif, now, asOfMonth);
  cache.set(key, { at: Date.now(), value });
  return value;
}

function compute(cif: string, now: Date, asOfMonth: string): AdvisorContext {
  const txns = liveTxns(cif);
  const accounts = readAccounts(cif);
  const categories = readCategories(cif, { includeArchived: true });
  const jarConfig = readJarConfig(cif);
  const fixedIds = new Set(categories.filter((c) => c.fixed).map((c) => c.id));
  const labels = new Map(categories.map((c) => [c.id, c.label]));

  // Complete months before `now`, oldest first.
  const months: AdvisorMonth[] = [];
  const byMonthCategory: Array<Array<{ categoryId: string; amount: number }>> = [];
  let fixedSum = 0;
  const categoryTotals = new Map<string, number>();
  for (let back = MONTHS_BACK; back >= 1; back--) {
    const monthKey = addMonthsToKey(asOfMonth, -back);
    const period = monthPeriodFromKey(monthKey);
    const cf = aggregateCashflow(txns, period, fixedIds);
    const txnCount = txns.filter((t) => t.status !== "reversed" && inPeriod(t, period)).length;
    months.push({ monthKey, income: cf.income, expense: cf.expense, txnCount });
    byMonthCategory.push(cf.byCategory);
    if (txnCount === 0) continue;
    fixedSum += cf.fixed;
    for (const c of cf.byCategory) categoryTotals.set(c.categoryId, (categoryTotals.get(c.categoryId) ?? 0) + c.amount);
  }
  const used = months.filter((m) => m.txnCount > 0);
  const monthsUsed = used.length;
  const incomeSum = used.reduce((s, m) => s + m.income, 0);
  const expenseSum = used.reduce((s, m) => s + m.expense, 0);
  const avgIncome = mean(incomeSum, monthsUsed);
  const avgExpense = mean(expenseSum, monthsUsed);
  const fixedExpense = mean(fixedSum, monthsUsed);
  const flexExpense = fixedExpense === "unknown" || avgExpense === "unknown" ? "unknown" : avgExpense - fixedExpense;

  const topCategories = [...categoryTotals]
    .filter(([, total]) => total > 0 && monthsUsed > 0)
    .map(([categoryId, total]) => ({
      categoryId,
      label: labels.get(categoryId) ?? null,
      average: Math.round(total / monthsUsed),
      fixed: fixedIds.has(categoryId),
    }))
    .sort((a, b) => b.average - a.average);
  const cuttable: CategoryAverage[] = topCategories
    .filter((c) => !c.fixed)
    .map(({ categoryId, label, average }) => ({ categoryId, label, average }));

  // Month-level engine view (jars, obligations, month-end projection, runway).
  const raw: RawData = { transactions: txns, accounts, assets: [], liabilities: [], budgets: [], snapshots: [], goals: [], products: [] };
  const fin = computeFinancials(raw, asOfMonth, { now, transactions: txns, jarConfig, categories });

  const casaRaw = casaBalanceOrUnknown(accounts);
  const casa = casaRaw === "unknown" ? null : casaRaw;
  const savings = sumOf(accounts, "savings", (a) => a.availableBalance);
  const cardBalance = sumOf(accounts, "credit_card", (a) => a.balance);
  const creditCardDebt = cardBalance === null ? null : Math.max(0, -cardBalance);

  const cashflowIn = goalCashflowInput(cif, now);
  resumeExpiredPauses(cif, now);
  const existingGoals: AdvisorGoal[] = listGoals(cif)
    .filter((g) => g.status === "active")
    .map((g) => {
      const v = loadGoalView(cif, g, now, cashflowIn);
      return {
        id: g.id,
        name: g.name,
        targetAmount: g.targetAmount,
        currentAmount: v.currentAmount,
        targetDate: g.targetDate,
        monthlyContribution: g.monthlyContribution,
        state: v.progress.state,
        percent: v.progress.percent,
      };
    });

  const recent = used.slice(-HEALTH_MONTHS);
  const recentPeriods = recent.map((m) => monthPeriodFromKey(m.monthKey));
  const inRecent = (t: Transaction) => recentPeriods.some((p) => inPeriod(t, p));
  const savingsIds = new Set(accounts.filter((a) => a.type === "savings").map((a) => a.id));
  const savingsTransfers3 = savingsIds.size === 0 ? null : txns
    .filter((t) => t.type === "transfer" && t.status === "posted" && t.direction === "credit" && savingsIds.has(t.accountId) && inRecent(t))
    .reduce((s, t) => s + t.amount, 0);
  const cardPayments3 = accounts.some((a) => a.type === "credit_card")
    ? txns.filter((t) => t.type === "card_payment" && t.status === "posted" && inRecent(t)).reduce((s, t) => s + t.amount, 0)
    : null;
  const health = computeHealth({
    income3: recent.reduce((s, m) => s + m.income, 0),
    expense3: recent.reduce((s, m) => s + m.expense, 0),
    monthsUsed3: recent.length,
    casa,
    savings,
    essentialMonthly: fixedExpense === "unknown" || fixedExpense === 0 ? null : fixedExpense,
    savingsTransfers3,
    cardPayments3,
    goals: existingGoals,
  });

  const pool = fin.unallocatedPool.amount;
  // Only fixed bills and liabilities count as obligations; everyday merchants are not "due".
  const fixedMerchants = new Set(
    fin.recurring.filter((r) => fixedIds.has(r.categoryId)).map((r) => `rec_${r.merchantNormalizedName}`),
  );
  const signals = computeSignals({
    now,
    obligations: fin.obligations.filter((o) => o.kind === "liability" || fixedMerchants.has(o.id)),
    endOfMonth: fin.endOfMonth.value,
    lastMonthByCategory: byMonthCategory[MONTHS_BACK - 1],
    prevMonthByCategory: byMonthCategory[MONTHS_BACK - 2],
    labels,
    recurring: fin.recurring,
    txns,
    unallocatedCash: pool === "unknown" ? null : pool,
    avgExpense,
    goals: existingGoals,
  });

  const unknown: string[] = [];
  if (avgIncome === "unknown") unknown.push("income");
  if (casa === null) unknown.push("casa");
  if (savings === null) unknown.push("savings");
  if (creditCardDebt === null) unknown.push("creditCardDebt");
  if (health.onTimePayment.score === null) unknown.push("onTimePayment");

  return {
    cif,
    asOfMonth,
    months,
    avgIncome,
    avgExpense,
    surplus: averageSurplus(months).value,
    monthsUsed,
    fixedExpense,
    flexExpense,
    topCategories,
    cuttable,
    balances: { current: casa, savings, creditCardDebt },
    jars: fin.jarEnvelope.jars.map((j) => ({
      id: j.jarId,
      label: j.label,
      limit: j.limit,
      spent: j.spent,
      balance: j.balance,
      spendable: jarSpendable(j.balance),
    })),
    existingGoals,
    runwayDays: fin.runway.months === null ? "unknown" : Math.round(fin.runway.months * DAYS_PER_MONTH),
    health,
    signals,
    dataQuality: { monthsUsed, unknown, source: "mock" },
  };
}
