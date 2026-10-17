/**
 * Envelope engine — the deterministic truth for the Tổng quan "hũ (phong bì)"
 * widget. Income was removed from the product, so the envelope no longer divides
 * *thu nhập*; instead the user partitions the **CASA balance** (số dư khả dụng
 * các tài khoản `current`) into jars. This is a pure DISPLAY/bookkeeping
 * partition of money already in the account — it moves no real money and never
 * touches a transfer/OTP (invariant #3).
 *
 * ONE number per jar (`budgetLimit`): số phân bổ = trần chi = số dư gốc. There is
 * no separate "đã phân bổ" ledger — a jar shows a balance the moment it has a
 * `budgetLimit`. Two outputs, scoped to one period (OverviewTab pins the current
 * month for `spent`; the pool is a running stock, not a per-period flow):
 *
 *  1. "Chờ phân bổ" — the CASA money no jar's **số dư (spendable)** claims yet:
 *     `CASA − Σ spendable` where `spendable(jar) = max(0, remaining)`. This is the
 *     SPENDABLE/BALANCE lens — the SAME number as the transfer picker's "Chưa phân
 *     bổ" (`Financials.unallocatedPool`) and the write-path cap (`fitsCasaCap`,
 *     now `Σ spendable ≤ CASA`). One definition of "unallocated" everywhere
 *     (D26): the card, the allocation sheet's "Còn lại để chia", the picker and
 *     the cap all read `CASA − Σ spendable`.
 *
 *     Why balance, not limit: because CASA is the LIVE balance (a confirmed
 *     transfer lowers it), `CASA − Σ spendable` is invariant to spending — money
 *     spent leaves CASA and shrinks that jar's `remaining` by the same amount, so
 *     the leftover stays the true "chưa gán vào hũ nào". The old limit lens
 *     (`CASA − Σ budgetLimit`) drifted negative after any spend and is retired.
 *  2. Per-jar SỐ DƯ "còn lại trong hũ" = `budgetLimit − spent + (Σ nhận − Σ cho)`.
 *     `spent` reuses the jar-budget net expense (DRY, invariant #2). An inter-jar
 *     transfer moves this balance and NOTHING else — `overLimit = spent > budgetLimit`
 *     stays on the plan axis, so being covered never erases "đã vượt hạn mức".
 *
 * Invariants honoured:
 *  - Engine is the sole source of these numbers (invariant #1); the UI renders.
 *  - No CASA account → pool/pending are genuinely "unknown", never a fabricated 0
 *    (invariant #6). A jar with no `budgetLimit` → `remaining` is `null`
 *    ("chưa có số dư"), never 0.
 */

import type { Account, DataSource, JarConfig } from "@/domain/models";
import { validBudgetLimit } from "./jar-budget";
import { jarSpendable } from "./jar-spendable";
import { coverageOf, UNKNOWN, type AggregateMeta, type Amount, type Period } from "./types";

/** CASA pool = tổng `availableBalance` các tài khoản `current`. Không có → unknown. */
export function casaPool(accounts: Account[]): { amount: Amount; sources: DataSource[]; freshness: string | null } {
  const current = accounts.filter((a) => a.type === "current");
  if (current.length === 0) return { amount: UNKNOWN, sources: [], freshness: null };
  let sum = 0;
  let freshness: string | null = null;
  const sources: DataSource[] = [];
  for (const a of current) {
    sum += a.availableBalance;
    sources.push(a.source);
    if (!freshness || a.lastSyncedAt > freshness) freshness = a.lastSyncedAt;
  }
  return { amount: sum, sources, freshness };
}

export interface PendingAllocation {
  /**
   * "Chờ phân bổ" = `pool − allocated` (`CASA − Σ spendable`) — the money no jar's
   * balance claims yet, identical to the allocation sheet's opening "Còn lại để
   * chia" and to `Financials.unallocatedPool`. May be negative (see
   * `overAllocated`); "unknown" khi không có tài khoản current (invariant #6, D27).
   */
  amount: Amount;
  /** True when Σ spendable exceeds CASA (jars claim more balance than CASA holds). */
  overAllocated: boolean;
  /** Tổng pool CASA (Σ availableBalance các tài khoản current); "unknown" khi không có. */
  pool: Amount;
  /** Tổng số dư các hũ đang giữ (Σ spendable = Σ max(0, remaining)) — the amount subtracted from the pool. */
  allocated: number;
  meta: AggregateMeta;
}

export interface JarEnvelopeLine {
  jarId: string;
  label: string;
  /** Con số duy nhất của hũ: số phân bổ = trần chi = số dư gốc; `null` = chưa đặt. */
  budgetLimit: number | null;
  /** Net expense over this jar's categories this period (from jar-budget). */
  spent: number;
  /**
   * SỐ DƯ hũ = `budgetLimit − spent + (Σ nhận − Σ cho)`; `null` when no budgetLimit.
   * May be negative (hết tiền — a separate axis from `overLimit`).
   */
  remaining: number | null;
  /** True khi chi vượt HẠN MỨC GỐC (`budgetLimit != null && spent > budgetLimit`). */
  overLimit: boolean;
  /** True when the jar has spending this period (spent > 0). */
  inUse: boolean;
  source: DataSource;
  freshness: string | null;
}

export interface JarEnvelopeResult {
  pending: PendingAllocation;
  jars: JarEnvelopeLine[];
  meta: AggregateMeta;
}

function buildLine(
  jarId: string,
  label: string,
  budgetLimit: number | null,
  spent: number,
  rebalanceNet: number,
): JarEnvelopeLine {
  // `budgetLimit` là hạn mức tháng, cũng là số dư gốc đầu kỳ. Chưa đặt → "chưa có
  // số dư" (null, không phải 0 — invariant #6). HAI TRỤC TÁCH BẠCH: rebalance
  // (Σ nhận − Σ cho) chỉ dịch chuyển `remaining` (SỐ DƯ); `overLimit` vẫn đo `spent`
  // với `budgetLimit` GỐC, nên một hũ đã được bù tiền vẫn là "vượt kế hoạch".
  const hasLimit = budgetLimit !== null;
  const remaining = hasLimit ? budgetLimit - spent + rebalanceNet : null;
  return {
    jarId,
    label,
    budgetLimit,
    spent,
    remaining,
    overLimit: hasLimit && spent > budgetLimit,
    inUse: spent > 0,
    // A budgetLimit is user-entered (self_reported); an empty jar carries the baseline.
    source: hasLimit ? "self_reported" : "mock",
    freshness: null,
  };
}

/**
 * Per-jar envelope lines. Reads `jar.budgetLimit` directly from config; `spentByJar`
 * reuses jar-budget's net expense per jar (huId → spent), so this never re-derives
 * spend (DRY, invariant #2). A jar with no `budgetLimit` stays `null` ("chưa có số
 * dư"), never a fabricated 0 (invariant #6).
 */
export function jarEnvelopeLines(
  config: JarConfig,
  spentByJar: Map<string, number>,
  rebalanceNetByJar?: Map<string, number>,
): JarEnvelopeLine[] {
  return config.jars.map((jar) =>
    buildLine(
      jar.id,
      jar.label,
      validBudgetLimit(jar.budgetLimit),
      spentByJar.get(jar.id) ?? 0,
      rebalanceNetByJar?.get(jar.id) ?? 0,
    ),
  );
}

/**
 * Compose the full envelope result for `period`. Deterministic. `spentByJar` is
 * jar-budget's per-jar net expense (huId → spent); `accounts` supplies the CASA
 * pool. "Chờ phân bổ" is the SPENDABLE lens (`CASA − Σ max(0, remaining)`) — the
 * SAME number as `Financials.unallocatedPool`, the allocation sheet and the cap,
 * so every "unallocated" surface reads one truth (D26).
 */
export function evaluateJarEnvelope(
  config: JarConfig,
  accounts: Account[],
  spentByJar: Map<string, number>,
  period: Period,
  /** Net inter-jar rebalance per jar (`Σ nhận − Σ cho`); absent → all zero. */
  rebalanceNetByJar?: Map<string, number>,
): JarEnvelopeResult {
  const jars = jarEnvelopeLines(config, spentByJar, rebalanceNetByJar);
  // Balance lens: Σ spendable = Σ max(0, remaining) — a jar with no limit (remaining
  // null) or an overspent jar (remaining < 0) claims 0. Same Σ the unallocated pool
  // and the cap use, so every "unallocated" number agrees (D26).
  const allocated = jars.reduce((s, l) => s + (jarSpendable(l.remaining) ?? 0), 0);
  const { amount: pool, sources, freshness } = casaPool(accounts);
  // No CASA account → genuinely unknown, never a fabricated 0 that would read as a
  // negative headroom (invariant #6, D27).
  const amount: Amount = pool === UNKNOWN ? UNKNOWN : pool - allocated;

  const meta: AggregateMeta = {
    period,
    sourceCoverage: coverageOf(sources, sources.length, pool === UNKNOWN ? 1 : 0),
    freshness,
  };
  const pending: PendingAllocation = {
    amount,
    overAllocated: amount !== UNKNOWN && amount < 0,
    pool,
    allocated,
    meta,
  };

  return { pending, jars, meta };
}
