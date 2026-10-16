/**
 * Envelope engine — the deterministic truth for the Tổng quan "hũ (phong bì)"
 * widget (plan 260914-1436). Two things, both DERIVED from the allocation ledger
 * (no stored balance, no proxy — post-red-team RT-1/RT-2):
 *
 *  1. "Chờ phân bổ" — the period's income not yet allocated into a jar, plus the
 *     EXACT count of income transactions still "chưa chia hết" (ledger-keyed to a
 *     concrete `txnId`, never a proxy over a pooled sum).
 *  2. Per-jar "còn lại trong hũ" = `fundedThisPeriod − spentThisPeriod`, where
 *     funded is the period-income allocated INTO the jar and spent reuses the
 *     jar-budget net expense (DRY, invariant #2). Never the raw `actualAmount`.
 *
 * Everything is scoped to one period (OverviewTab pins the current month).
 *
 * Invariants honoured:
 *  - Engine is the sole source of these numbers (invariant #1); the UI renders.
 *  - Coherence identity (tested): `pending.amount + Σ fundedThisPeriod == income`.
 *    Each allocation is capped at its income txn's remaining capacity (FIFO), so
 *    over-allocation (corrupt data) can never inflate funded past income.
 *  - An allocation whose `txnId` is not an in-period income txn is INERT — it
 *    neither reduces pending nor credits a jar (defends the un-validated route,
 *    RT-3). An allocation whose `jarId` is not in config folds into "Khác" so the
 *    money is never lost from the identity (RT-4).
 *  - No income data → pending amount is genuinely "unknown", never a fabricated 0
 *    (invariant #6). A jar with no funding this period → `funded`/`remaining` are
 *    `null` ("chưa có số dư"), never 0.
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
  /** Period income allocated into this jar; `null` = chưa nạp kỳ này (never 0). */
  funded: number | null;
  /** Net expense over this jar's categories this period (from jar-budget). */
  spent: number;
  /** "còn lại trong hũ" = funded − spent; `null` when not funded. May be negative. */
  remaining: number | null;
  /** True when funded this period (`funded !== null` ⇔ funded > 0). Drives "ĐANG DÙNG". */
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
 * (huId → spent), so this never re-derives spend (DRY, invariant #2). Funded to a
 * `jarId` not in config folds into "Khác" so the coherence identity holds (RT-4).
 */
export function jarEnvelopeLines(
  config: JarConfig,
  fundedByJar: Map<string, number>,
  spentByJar: Map<string, number>,
): JarEnvelopeLine[] {
  const configIds = new Set(config.jars.map((j) => j.id));
  // Funded to jars no longer in config → fold into "Khác".
  let orphanFunded = 0;
  for (const [jarId, amount] of fundedByJar) {
    if (!configIds.has(jarId)) orphanFunded += amount;
  }

  const lines = config.jars.map((jar) => {
    let funded = fundedByJar.get(jar.id) ?? 0;
    if (jar.id === KHAC_JAR_ID) funded += orphanFunded;
    return buildLine(jar.id, jar.label, funded, spentByJar.get(jar.id) ?? 0);
  });

  // Orphan funding but no "Khác" jar in config → synthesize one so the money
  // still appears (and the identity holds).
  if (orphanFunded > 0 && !configIds.has(KHAC_JAR_ID)) {
    lines.push(buildLine(KHAC_JAR_ID, KHAC_JAR_LABEL, orphanFunded, spentByJar.get(KHAC_JAR_ID) ?? 0));
  }
  return lines;
}

function buildLine(jarId: string, label: string, funded: number, spent: number): JarEnvelopeLine {
  const inUse = funded > 0;
  return {
    jarId,
    label,
    funded: inUse ? funded : null,
    spent,
    remaining: inUse ? funded - spent : null,
    // Funded jars are user allocations (self_reported); an unfunded jar's line
    // carries the prototype baseline.
    inUse,
    source: inUse ? "self_reported" : "mock",
    freshness: null,
  };
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
  const pending = computePendingAllocation(incomeTxns, perTxn, period);
  const jars = jarEnvelopeLines(config, fundedByJar, spentByJar);

  return { pending, jars, meta: pending.meta };
}
