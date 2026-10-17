/**
 * Envelope engine — the deterministic truth for the Tổng quan "hũ (phong bì)"
 * widget. Income was removed from the product, so the envelope no longer divides
 * *thu nhập*; instead the user partitions the **CASA balance** (số dư khả dụng
 * các tài khoản `current`) into jars. This is a pure DISPLAY/bookkeeping
 * partition of money already in the account — it moves no real money and never
 * touches a transfer/OTP (invariant #3).
 *
 * TWO numbers per jar (plan 260923-jar-limit-vs-balance-split): the monthly
 * HẠN MỨC (`limit`, resets each month) and the running SỐ DƯ (`balance`, from
 * `jarBalances` — ledger deposits/withdrawals, spend and rebalance since the jar's
 * anchor). Two outputs, scoped to one period (OverviewTab pins the current month
 * for `spent`; the pool is a running stock, not a per-period flow):
 *
 *  1. "Chờ phân bổ" — the CASA money no jar's **số dư (spendable)** claims yet:
 *     `CASA − Σ spendable` where `spendable(jar) = max(0, balance)`. The SAME
 *     number as the transfer picker's "Chưa phân bổ" (`Financials.unallocatedPool`)
 *     and the write-path cap (`fitsCasaCap`, `Σ spendable ≤ CASA`) — one definition
 *     of "unallocated" everywhere (D26). Because CASA is the LIVE balance, money
 *     spent leaves CASA and shrinks that jar's balance by the same amount, so the
 *     leftover stays the true "chưa gán vào hũ nào".
 *  2. Per-jar line: `spent` (reused from jar-budget, DRY, invariant #2) vs `limit`
 *     → `overLimit`; and `balance`. An inter-jar transfer moves the balance and
 *     NOTHING else, so being covered never erases "đã vượt hạn mức".
 *
 * Invariants honoured:
 *  - Engine is the sole source of these numbers (invariant #1); the UI renders.
 *  - No CASA account → pool/pending are genuinely "unknown", never a fabricated 0
 *    (invariant #6). An unfunded jar (no ledger entry ≤ asOf, or a period before its
 *    anchor) → `balance` is `null` ("chưa có số dư"), never 0.
 */

import type { Account, DataSource, JarConfig } from "@/domain/models";
import type { JarBalanceFacts } from "./jar-balance";
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
  /** Tổng số dư các hũ đang giữ (Σ spendable = Σ max(0, balance)) — the amount subtracted from the pool. */
  allocated: number;
  meta: AggregateMeta;
}

export interface JarEnvelopeLine {
  jarId: string;
  label: string;
  /** Hạn mức tháng (kế hoạch, reset mỗi tháng); `null` = chưa đặt. */
  limit: number | null;
  /** Net expense over this jar's categories this period (from jar-budget). */
  spent: number;
  /**
   * SỐ DƯ hũ (running, from `jarBalances`); `null` = chưa có số dư. May be negative
   * (hết tiền — a separate axis from `overLimit`).
   */
  balance: number | null;
  /** True khi chi vượt HẠN MỨC (`limit != null && spent > limit`). */
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
  limit: number | null,
  spent: number,
  facts: JarBalanceFacts | undefined,
): JarEnvelopeLine {
  // HAI TRỤC TÁCH BẠCH: `overLimit` đo `spent` với hạn mức tháng; `balance` là số dư
  // chạy (ledger + chi + điều chỉnh từ mốc). Chưa có số dư → null, không phải 0
  // (invariant #6). Provenance theo số dư: ledger là self_reported.
  return {
    jarId,
    label,
    limit,
    spent,
    balance: facts?.balance ?? null,
    overLimit: limit !== null && spent > limit,
    inUse: spent > 0,
    source: facts?.source ?? "mock",
    freshness: null,
  };
}

/**
 * Per-jar envelope lines. Reads the limit from config; `spentByJar` reuses
 * jar-budget's net expense per jar (huId → spent, DRY, invariant #2); `balances`
 * comes from `jarBalances`. An unfunded jar stays `null`, never 0 (invariant #6).
 */
export function jarEnvelopeLines(
  config: JarConfig,
  spentByJar: Map<string, number>,
  balances?: Map<string, JarBalanceFacts>,
): JarEnvelopeLine[] {
  return config.jars.map((jar) =>
    buildLine(
      jar.id,
      jar.label,
      validBudgetLimit(jar.budgetLimit),
      spentByJar.get(jar.id) ?? 0,
      balances?.get(jar.id),
    ),
  );
}

/**
 * Compose the full envelope result for `period`. Deterministic. `spentByJar` is
 * jar-budget's per-jar net expense (huId → spent); `accounts` supplies the CASA
 * pool. "Chờ phân bổ" is the SPENDABLE lens (`CASA − Σ max(0, balance)`) — the
 * SAME number as `Financials.unallocatedPool`, the allocation sheet and the cap,
 * so every "unallocated" surface reads one truth (D26).
 */
export function evaluateJarEnvelope(
  config: JarConfig,
  accounts: Account[],
  spentByJar: Map<string, number>,
  period: Period,
  /** Running balances from `jarBalances` (same `now`); absent → every balance `null`. */
  balances?: Map<string, JarBalanceFacts>,
): JarEnvelopeResult {
  const jars = jarEnvelopeLines(config, spentByJar, balances);
  // Balance lens: Σ spendable = Σ max(0, balance) — an unfunded jar (balance null)
  // or an overspent jar (balance < 0) claims 0. Same Σ the unallocated pool and the
  // cap use, so every "unallocated" number agrees (D26).
  const allocated = jars.reduce((s, l) => s + (jarSpendable(l.balance) ?? 0), 0);
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
