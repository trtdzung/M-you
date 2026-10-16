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
 *  1. "Chờ phân bổ" — the CASA money no jar's spendable claims, the ONE
 *     unallocated definition `CASA − Σ spendable` (`computeUnallocatedPool`).
 *  2. Per-jar "còn lại trong hũ" = `budgetLimit − spent`. `spent` reuses the
 *     jar-budget net expense (DRY, invariant #2). `overLimit = spent > budgetLimit`.
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
import { computeUnallocatedPool } from "./unallocated-pool";
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
   * "Chờ phân bổ" = the ONE unallocated definition (`computeUnallocatedPool`):
   * `CASA − Σ spendable(jar)`. May be negative (see `overAllocated`) — the UI
   * decides how to present it; "unknown" khi không có tài khoản current.
   */
  amount: Amount;
  /** True when jars claim more spendable money than CASA holds. */
  overAllocated: boolean;
  /** Tổng pool CASA (Σ availableBalance các tài khoản current); "unknown" khi không có. */
  pool: Amount;
  /** Tổng hạn mức đã đặt cho các hũ (Σ budgetLimit) — the allocation-sheet total. */
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
  /** "còn lại trong hũ" = `budgetLimit − spent`; `null` when no budgetLimit. May be negative. */
  remaining: number | null;
  /** True khi chi vượt hạn mức (`budgetLimit != null && spent > budgetLimit`). */
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
  // `budgetLimit` là con số duy nhất: số dành cho hũ = trần chi = số dư gốc. Chưa
  // đặt → "chưa có số dư" (null, không phải 0 — invariant #6). Rebalance coverage
  // (Σ nhận − Σ cho) folds into remaining; `overLimit` is recomputed against the
  // POST-rebalance remaining, so a jar that has been covered is no longer "vượt".
  const hasLimit = budgetLimit !== null;
  const remaining = hasLimit ? budgetLimit - spent + rebalanceNet : null;
  return {
    jarId,
    label,
    budgetLimit,
    spent,
    remaining,
    overLimit: remaining !== null && remaining < 0,
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
 * pool. "Chờ phân bổ" delegates to `computeUnallocatedPool` (`CASA − Σ spendable`)
 * so the overview and the transfer picker show the SAME number (D26/S12).
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
  const allocated = jars.reduce((s, l) => s + (l.budgetLimit ?? 0), 0);
  const { amount: pool, sources, freshness } = casaPool(accounts);
  const spendableTotal = jars.reduce((s, l) => s + (jarSpendable(l.remaining) ?? 0), 0);
  const unallocated = computeUnallocatedPool({ casaBalance: pool, spendableTotal });

  const meta: AggregateMeta = {
    period,
    sourceCoverage: coverageOf(sources, sources.length, pool === UNKNOWN ? 1 : 0),
    freshness,
  };
  const pending: PendingAllocation = {
    amount: unallocated.amount,
    overAllocated: unallocated.overAllocated,
    pool,
    allocated,
    meta,
  };

  return { pending, jars, meta };
}
