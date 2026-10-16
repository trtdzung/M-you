/**
 * Jar evaluation — Model A, a display-only SNAPSHOT PARTITION of the current
 * primary-account balance. A jar earmarks a share of that balance; the sum of
 * every jar earmark plus a "Chưa phân bổ" residual is identical to the balance,
 * by construction. Jars never move money, never hold a balance, and never depend
 * on income or a clock (the superseded spending-envelope model did all three).
 *
 * Invariants honoured here:
 *  - Hard identity: `Σ(explicit earmark + residual) ≡ primaryBalance` exactly —
 *    the residual absorbs the whole-VND rounding remainder (invariant #1).
 *  - No money movement: an earmark is a lens over the balance, not a transfer (#3).
 *  - Unknown stays unknown: 0 or 2+ current accounts → `status:"unknown"`, no
 *    lines fabricated, never a silent 0 balance (#6).
 *  - Provenance per line (#5): an explicit line folds worst-case over its feeding
 *    spend transactions; the residual carries the primary account's own source /
 *    freshness ONLY (it has no feeding transactions — red-team #9).
 *  - The per-period "đã tiêu kỳ này" is an INFORMATIONAL overlay computed with the
 *    same spend rules as cash-flow (transfers excluded, refunds reversed, reversed
 *    dropped, pending separate); it never alters the earmark or the identity.
 */

import type { Account, DataSource, Jar, JarConfig, Transaction } from "@/domain/models";
import { CATEGORY_BY_ID } from "@/domain/models";
import { lowestTrustSource, oldestFreshness } from "@/lib/provenance";
import { netExpenseByCategory } from "./cashflow";
import type { Period } from "./types";

/** Result of validating one raw allocation-input string (M8). */
export interface JarInputResult {
  ok: boolean;
  /** Parsed value when `ok`; null when rejected — never `NaN` into the engine. */
  value: number | null;
  /** Vietnamese error message when rejected; null when accepted. */
  error: string | null;
}

/**
 * Validate a raw allocation input before it can reach the engine (Red Team M8).
 * Blank / non-numeric / non-finite is rejected; a percent must sit in [0,100];
 * a VND amount must be finite and non-negative. This is the ONLY gate between
 * the free-text setup field and `JarAllocation.value`, so it must never let a
 * `NaN`, an `Infinity`, or a negative slip through.
 */
export function validateJarInput(raw: string, mode: "percent" | "amount"): JarInputResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, value: null, error: "Nhập giá trị" };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, value: null, error: "Giá trị không hợp lệ" };
  if (n < 0) return { ok: false, value: null, error: "Không được âm" };
  if (mode === "percent" && n > 100) return { ok: false, value: null, error: "Tối đa 100%" };
  return { ok: true, value: n, error: null };
}

/** One partition line — an explicit jar, or the residual "Chưa phân bổ" line. */
export interface JarPartitionLine {
  jarId: string;
  label: string;
  categoryIds: string[];
  /** Share of the CURRENT balance earmarked here, rounded to whole VND. */
  earmark: number;
  /** Net expense over this jar's categories for the selected period (overlay). */
  spentThisPeriod: number;
  /** Same, for the previous period — feeds the MoM delta. */
  spentPrevPeriod: number;
  /** `spentThisPeriod > earmark` — a budget breach (warning, never a block). */
  isOverBudget: boolean;
  perCategory: { categoryId: string; label: string; spent: number }[];
  meta: { source: DataSource; freshness: string | null };
  /** The single residual line ("Chưa phân bổ"). */
  isResidual?: boolean;
  /** Residual `earmark < 0` — the user over-allocated (Σ chia > số dư). */
  isOverAllocated?: boolean;
}

/** Full partition of the current balance. `total` is exactly `primaryBalance`. */
export interface JarPartitionResult {
  status: "ok" | "unknown";
  /** The resolved current balance; null when unknown (0 or 2+ current accounts). */
  primaryBalance: number | null;
  /** Explicit jar lines followed by the residual line; empty when unknown. */
  lines: JarPartitionLine[];
  /** Σ of every line's earmark — equals `primaryBalance` exactly when known. */
  total: number;
  meta: { source: DataSource; freshness: string | null };
}

const EXPENSE_LIKE: ReadonlySet<Transaction["type"]> = new Set(["expense", "fee", "refund"]);

function inPeriod(txn: Transaction, period: Period): boolean {
  return txn.postedAt >= period.from && txn.postedAt <= period.to;
}

const labelOf = (categoryId: string) => CATEGORY_BY_ID[categoryId]?.label ?? categoryId;

/** Worst-case source + oldest freshness over the posted spend feeding `catIds`. */
function foldSpendProvenance(
  txns: Transaction[],
  period: Period,
  catIds: Set<string>,
): { source: DataSource; freshness: string | null } {
  const sources: (DataSource | null)[] = [];
  const freshness: (string | null)[] = [];
  for (const t of txns) {
    if (t.status !== "posted" || !inPeriod(t, period)) continue;
    if (!catIds.has(t.categoryId) || !EXPENSE_LIKE.has(t.type)) continue;
    sources.push(t.source);
    freshness.push(t.postedAt);
  }
  return {
    source: lowestTrustSource(sources) ?? "mock",
    freshness: oldestFreshness(freshness),
  };
}

/**
 * The primary account = the single `type:"current"` account. Exactly one → that
 * account; 0 or 2+ → null (the balance is genuinely ambiguous, never a silent
 * first-match and never 0 — invariant #6, red-team #7/#10).
 */
export function resolvePrimaryAccount(accounts: Account[]): Account | null {
  const currents = accounts.filter((a) => a.type === "current");
  return currents.length === 1 ? currents[0] : null;
}

/** Convenience: the resolved balance, or "unknown" when the account is ambiguous. */
export function resolvePrimaryBalance(accounts: Account[]): number | "unknown" {
  const primary = resolvePrimaryAccount(accounts);
  return primary ? primary.balance : "unknown";
}

/** Earmark for a jar: percent → `round(balance*value/100)`; amount → `round(value)`. */
export function resolveAllocation(jar: Jar, primaryBalance: number): number {
  return jar.allocation.mode === "percent"
    ? Math.round((primaryBalance * jar.allocation.value) / 100)
    : Math.round(jar.allocation.value);
}

function spentOver(byCat: Map<string, number>, categoryIds: string[]): number {
  return categoryIds.reduce((s, id) => s + Math.max(0, byCat.get(id) ?? 0), 0);
}

/**
 * Evaluate the balance partition. Every explicit jar earmarks a share of the
 * current balance; the residual "Chưa phân bổ" line takes whatever is left
 * (`balance − Σ earmarks`), so the total is exactly the balance by construction
 * — the residual also absorbs the whole-VND rounding remainder. An unknown
 * primary balance yields a `status:"unknown"` result with no lines (never 0).
 */
export function evaluateJarPartition(
  config: JarConfig,
  primary: Account | null,
  txns: Transaction[],
  period: Period,
  prevPeriod: Period,
): JarPartitionResult {
  if (!primary) {
    return {
      status: "unknown",
      primaryBalance: null,
      lines: [],
      total: 0,
      meta: { source: "estimated", freshness: null },
    };
  }

  const balance = primary.balance;
  const byCat = netExpenseByCategory(txns, period);
  const byCatPrev = netExpenseByCategory(txns, prevPeriod);

  const explicit: JarPartitionLine[] = config.jars.map((jar) => {
    const earmark = resolveAllocation(jar, balance);
    const perCategory = jar.categoryIds.map((categoryId) => ({
      categoryId,
      label: labelOf(categoryId),
      spent: Math.max(0, byCat.get(categoryId) ?? 0),
    }));
    const spentThisPeriod = spentOver(byCat, jar.categoryIds);
    return {
      jarId: jar.id,
      label: jar.label,
      categoryIds: jar.categoryIds,
      earmark,
      spentThisPeriod,
      spentPrevPeriod: spentOver(byCatPrev, jar.categoryIds),
      isOverBudget: spentThisPeriod > earmark,
      perCategory,
      meta: foldSpendProvenance(txns, period, new Set(jar.categoryIds)),
    };
  });

  const allocated = explicit.reduce((s, l) => s + l.earmark, 0);
  const residualEarmark = balance - allocated; // absorbs the rounding remainder

  const residual: JarPartitionLine = {
    jarId: "unallocated",
    label: "Chưa phân bổ",
    categoryIds: [],
    earmark: residualEarmark,
    spentThisPeriod: 0,
    spentPrevPeriod: 0,
    isOverBudget: false,
    perCategory: [],
    // The residual has no feeding transactions — its provenance is the primary
    // account's own source / freshness ONLY (red-team #9).
    meta: { source: primary.source, freshness: primary.lastSyncedAt },
    isResidual: true,
    isOverAllocated: residualEarmark < 0,
  };

  const lines = [...explicit, residual];
  return {
    status: "ok",
    primaryBalance: balance,
    lines,
    total: lines.reduce((s, l) => s + l.earmark, 0),
    meta: {
      source: lowestTrustSource(lines.map((l) => l.meta.source)) ?? primary.source,
      freshness: oldestFreshness(lines.map((l) => l.meta.freshness)),
    },
  };
}

/**
 * Dev-only identity guard: `Σ earmark === primaryBalance`. Logs (never throws) in
 * non-production so a broken partition surfaces in tests/dev without crashing a
 * prototype build. A no-op in production.
 */
export function assertPartitionBalances(result: JarPartitionResult): void {
  if (process.env.NODE_ENV === "production") return;
  if (result.status !== "ok" || result.primaryBalance === null) return;
  const sum = result.lines.reduce((s, l) => s + l.earmark, 0);
  if (sum !== result.primaryBalance) {
    // eslint-disable-next-line no-console
    console.error(`[jars] partition sum ${sum} !== balance ${result.primaryBalance}`);
  }
}
