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
 *  1. "Chờ phân bổ" — the CASA pool not yet earmarked into a jar
 *     (`pool − Σ budgetLimit`, floored at 0).
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
  /** Số dư CASA chưa phân bổ = `pool − allocated` (sàn 0); "unknown" khi không có tài khoản current. */
  amount: Amount;
  /** Tổng pool CASA (Σ availableBalance các tài khoản current); "unknown" khi không có. */
  pool: Amount;
  /** Tổng đã phân bổ vào các hũ (Σ budgetLimit). */
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

function buildLine(jarId: string, label: string, budgetLimit: number | null, spent: number): JarEnvelopeLine {
  // `budgetLimit` là con số duy nhất: số dành cho hũ = trần chi = số dư gốc. Chưa
  // đặt → "chưa có số dư" (null, không phải 0 — invariant #6).
  const hasLimit = budgetLimit !== null;
  return {
    jarId,
    label,
    budgetLimit,
    spent,
    remaining: hasLimit ? budgetLimit - spent : null,
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
export function jarEnvelopeLines(config: JarConfig, spentByJar: Map<string, number>): JarEnvelopeLine[] {
  return config.jars.map((jar) =>
    buildLine(jar.id, jar.label, jar.budgetLimit ?? null, spentByJar.get(jar.id) ?? 0),
  );
}

/**
 * Compose the full envelope result for `period`. Deterministic. `spentByJar` is
 * jar-budget's per-jar net expense (huId → spent); `accounts` supplies the CASA
 * pool. "Chờ phân bổ" = `pool − Σ budgetLimit`.
 */
export function evaluateJarEnvelope(
  config: JarConfig,
  accounts: Account[],
  spentByJar: Map<string, number>,
  period: Period,
): JarEnvelopeResult {
  const jars = jarEnvelopeLines(config, spentByJar);
  const allocated = jars.reduce((s, l) => s + (l.budgetLimit ?? 0), 0);
  const { amount: pool, sources, freshness } = casaPool(accounts);
  const pendingAmount: Amount = pool === UNKNOWN ? UNKNOWN : Math.max(0, pool - allocated);

  const meta: AggregateMeta = {
    period,
    sourceCoverage: coverageOf(sources, sources.length, pool === UNKNOWN ? 1 : 0),
    freshness,
  };
  const pending: PendingAllocation = { amount: pendingAmount, pool, allocated, meta };

  return { pending, jars, meta };
}
