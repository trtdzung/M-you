/**
 * Envelope engine — the deterministic truth for the Tổng quan "hũ (phong bì)"
 * widget (plan 260914-1436). "Hũ IS the budget": a jar's per-period funding is
 * its configured `budgetLimit` (the plan set in Cài đặt), so the widget mirrors
 * that division WITHOUT a manual "Chia ngay". An explicit allocation OVERRIDES
 * the plan for that jar this period. Two outputs:
 *
 *  1. "Chờ phân bổ" — the period's income the plan (limits) + explicit
 *     allocations do not yet cover, plus the count of income transactions still
 *     "chưa chia hết" (ledger-keyed to a concrete `txnId`, never a proxy).
 *  2. Per-jar "còn lại trong hũ" = `funded − spent`, where funded is the jar's
 *     explicit allocation if any, else its `budgetLimit`, and spent reuses the
 *     jar-budget net expense (DRY, invariant #2). Never the raw `actualAmount`.
 *
 * Everything is scoped to one period (OverviewTab pins the current month).
 *
 * Invariants honoured:
 *  - Engine is the sole source of these numbers (invariant #1); the UI renders.
 *  - "Chờ phân bổ" identity (tested): `pending.amount + Σ absorbed == income`,
 *    where `absorbed` is the income actually consumed by explicit allocations
 *    (FIFO, capped per txn) plus the planned limits (a pooled FIFO absorb). The
 *    plan may EXCEED income; the pool simply runs out (pending floors at 0) while
 *    a jar's card still shows its full limit — the plan, not the consumed income.
 *  - An allocation whose `txnId` is not an in-period income txn is INERT — it
 *    neither reduces pending nor credits a jar (defends the un-validated route,
 *    RT-3). An allocation whose `jarId` is not in config folds into "Khác" (RT-4).
 *  - No income data → pending amount is genuinely "unknown", never a fabricated 0
 *    (invariant #6). A jar with no limit AND no allocation → `funded`/`remaining`
 *    are `null` ("chưa có số dư"), never 0.
 */

import type { DataSource, JarAllocation, JarConfig, Transaction } from "@/domain/models";
import { KHAC_JAR_ID, KHAC_JAR_LABEL } from "./category-jars";
import { coverageOf, UNKNOWN, type AggregateMeta, type Amount, type Period } from "./types";

/** Posted income transaction within the period — same rule as `aggregateCashflow`. */
function isPeriodIncome(t: Transaction, period: Period): boolean {
  return t.status === "posted" && t.type === "income" && t.postedAt >= period.from && t.postedAt <= period.to;
}

export interface PendingTxn {
  txnId: string;
  /** The income amount of this transaction (VND). */
  income: number;
  /** Effective amount allocated away from it (capped at `income`). */
  allocated: number;
  /** `income − allocated` — still "chờ phân bổ" for this txn. */
  remaining: number;
}

export interface PendingAllocation {
  /** Σ remaining over period income; `"unknown"` when there is no income data. */
  amount: Amount;
  /** Count of income txns with `remaining > 0` ("N GD chưa vào hũ"). */
  unallocatedCount: number;
  /** Ids of those txns (for the "Chia ngay" FIFO planner). */
  unallocatedTxnIds: string[];
  /** Per income txn breakdown (income order), for the allocation sheet. */
  perTxn: PendingTxn[];
  meta: AggregateMeta;
}

export interface JarEnvelopeLine {
  jarId: string;
  label: string;
  /** Jar funding: explicit allocation, else `budgetLimit`; `null` = chưa đặt & chưa nạp (never 0). */
  funded: number | null;
  /** Net expense over this jar's categories this period (from jar-budget). */
  spent: number;
  /** "còn lại trong hũ" = funded − spent; `null` when unfunded. May be negative. */
  remaining: number | null;
  /** True when the jar has spending this period (spent > 0). Drives "ĐANG DÙNG". */
  inUse: boolean;
  source: DataSource;
  freshness: string | null;
}

export interface JarEnvelopeResult {
  pending: PendingAllocation;
  jars: JarEnvelopeLine[];
  meta: AggregateMeta;
}

/**
 * FIFO reduce allocations against period income. Returns per-txn consumption and
 * per-jar funded totals, both capped so no txn is drawn past its income. Skips
 * allocations whose `txnId` is not period income (inert, RT-3).
 */
function foldAllocations(
  incomeTxns: Transaction[],
  allocations: JarAllocation[],
): { perTxn: PendingTxn[]; fundedByJar: Map<string, number> } {
  const consumed = new Map<string, number>();
  const incomeById = new Map(incomeTxns.map((t) => [t.id, t.amount]));
  const fundedByJar = new Map<string, number>();

  for (const a of allocations) {
    const income = incomeById.get(a.txnId);
    if (income === undefined) continue; // not period income → inert
    const used = consumed.get(a.txnId) ?? 0;
    const effective = Math.max(0, Math.min(a.amount, income - used));
    if (effective === 0) continue;
    consumed.set(a.txnId, used + effective);
    fundedByJar.set(a.jarId, (fundedByJar.get(a.jarId) ?? 0) + effective);
  }

  const perTxn: PendingTxn[] = incomeTxns.map((t) => {
    const allocated = consumed.get(t.id) ?? 0;
    return { txnId: t.id, income: t.amount, allocated, remaining: t.amount - allocated };
  });
  return { perTxn, fundedByJar };
}

/** "Chờ phân bổ" for the period — unknown when there is no income data. */
export function computePendingAllocation(
  incomeTxns: Transaction[],
  perTxn: PendingTxn[],
  period: Period,
): PendingAllocation {
  const sources = incomeTxns.map((t) => t.source);
  const freshness = incomeTxns.reduce<string | null>(
    (acc, t) => (!acc || t.postedAt > acc ? t.postedAt : acc),
    null,
  );
  const meta: AggregateMeta = {
    period,
    sourceCoverage: coverageOf(sources, incomeTxns.length, 0),
    freshness,
  };

  if (incomeTxns.length === 0) {
    return { amount: UNKNOWN, unallocatedCount: 0, unallocatedTxnIds: [], perTxn: [], meta };
  }
  const outstanding = perTxn.filter((p) => p.remaining > 0);
  const amount = perTxn.reduce((s, p) => s + p.remaining, 0);
  return {
    amount,
    unallocatedCount: outstanding.length,
    unallocatedTxnIds: outstanding.map((p) => p.txnId),
    perTxn,
    meta,
  };
}

/**
 * Per-jar envelope lines. `spentByJar` reuses jar-budget's net expense per jar
 * (huId → spent), so this never re-derives spend (DRY, invariant #2).
 *
 * A jar's funding is its per-period PLAN — the configured `budgetLimit` ("hũ IS
 * the budget") — so the Tổng quan card reflects what was already divided in Cài
 * đặt without a manual "Chia ngay" (funded = hạn mức, "còn lại" = hạn mức −
 * đã tiêu). An EXPLICIT allocation for the jar OVERRIDES that plan (the user
 * chose to split income differently this period). A jar with neither a limit nor
 * an allocation stays `null` ("chưa có số dư"), never a fabricated 0 (invariant
 * #6). Allocation funded to a `jarId` not in config folds into "Khác" (RT-4).
 */
export function jarEnvelopeLines(
  config: JarConfig,
  fundedByJar: Map<string, number>,
  spentByJar: Map<string, number>,
): JarEnvelopeLine[] {
  const configIds = new Set(config.jars.map((j) => j.id));
  // Allocation funded to jars no longer in config → fold into "Khác".
  let orphanFunded = 0;
  for (const [jarId, amount] of fundedByJar) {
    if (!configIds.has(jarId)) orphanFunded += amount;
  }

  const lines = config.jars.map((jar) => {
    // Explicit allocation overrides the plan; otherwise fall back to the jar's
    // configured limit; a jar with neither stays unfunded (null).
    const allocated = fundedByJar.get(jar.id);
    let funded: number | null = allocated ?? jar.budgetLimit ?? null;
    if (jar.id === KHAC_JAR_ID && orphanFunded > 0) funded = (funded ?? 0) + orphanFunded;
    return buildLine(jar.id, jar.label, funded, spentByJar.get(jar.id) ?? 0);
  });

  // Orphan funding but no "Khác" jar in config → synthesize one so the money
  // still appears (and the identity holds).
  if (orphanFunded > 0 && !configIds.has(KHAC_JAR_ID)) {
    lines.push(buildLine(KHAC_JAR_ID, KHAC_JAR_LABEL, orphanFunded, spentByJar.get(KHAC_JAR_ID) ?? 0));
  }
  return lines;
}

function buildLine(jarId: string, label: string, funded: number | null, spent: number): JarEnvelopeLine {
  const hasPlan = funded !== null;
  return {
    jarId,
    label,
    funded,
    spent,
    remaining: hasPlan ? funded - spent : null,
    // "ĐANG DÙNG" now means "có phát sinh chi tiêu kỳ này" (most jars carry a
    // plan, so a plan alone is not a useful signal).
    inUse: spent > 0,
    // A planned/allocated jar reflects user configuration (self_reported); an
    // unfunded jar's line carries the prototype baseline.
    source: hasPlan ? "self_reported" : "mock",
    freshness: null,
  };
}

/**
 * Reduce each income txn's "còn lại" by a shared pool (the jars' planned funding
 * that has no explicit allocation), FIFO in income order and capped per txn — so
 * "chờ phân bổ" is the income the plan does not yet cover. The plan can exceed
 * income; the pool simply runs out and the excess is ignored (a jar's card still
 * shows its full limit — the plan, not the consumed income).
 */
function absorbPool(perTxn: PendingTxn[], pool: number): PendingTxn[] {
  let left = pool;
  return perTxn.map((p) => {
    if (left <= 0 || p.remaining <= 0) return p;
    const take = Math.min(left, p.remaining);
    left -= take;
    return { ...p, allocated: p.allocated + take, remaining: p.remaining - take };
  });
}

/**
 * Compose the full envelope result for `period`. Deterministic. `spentByJar` is
 * jar-budget's per-jar net expense (huId → spent).
 */
export function evaluateJarEnvelope(
  config: JarConfig,
  txns: Transaction[],
  allocations: JarAllocation[],
  spentByJar: Map<string, number>,
  period: Period,
): JarEnvelopeResult {
  const incomeTxns = txns.filter((t) => isPeriodIncome(t, period));
  const { perTxn, fundedByJar } = foldAllocations(incomeTxns, allocations);

  // Jars funded by their PLAN (budgetLimit) rather than an explicit allocation
  // still reserve income — otherwise "chờ phân bổ" would ignore Cài đặt. Pool
  // those planned limits (excluding jars the user explicitly split) and absorb
  // them against the income left after explicit allocations.
  const budgetPool = config.jars.reduce(
    (sum, jar) => sum + (jar.budgetLimit !== undefined && !fundedByJar.has(jar.id) ? jar.budgetLimit : 0),
    0,
  );
  const pending = computePendingAllocation(incomeTxns, absorbPool(perTxn, budgetPool), period);
  const jars = jarEnvelopeLines(config, fundedByJar, spentByJar);

  return { pending, jars, meta: pending.meta };
}
