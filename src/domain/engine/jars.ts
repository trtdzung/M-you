/**
 * Spending-jar evaluation. A jar groups real expense categories and compares
 * their net spend against an allocation (a % of income, or a fixed VND cap).
 *
 * Invariants honoured here:
 *  - Spend math is exactly `netExpenseByCategory` (transfers excluded, refunds
 *    reversed, reversed dropped, pending separate) — jars wrap spend only (AD1).
 *  - An unknown income basis NEVER manufactures a healthy verdict: percent jars
 *    report `allocated: null`, `pct: null`, `status: "unknown"`; `used` is always
 *    the real posted spend (Red Team C1, invariant #6).
 *  - Provenance is folded worst-case across the feeding transactions (and, for
 *    percent jars, the income basis) — invariant #5.
 */

import type { DataSource, JarConfig, Transaction } from "@/domain/models";
import { CATEGORY_BY_ID } from "@/domain/models";
import { lowestTrustSource, oldestFreshness } from "@/lib/provenance";
import { netExpenseByCategory } from "./cashflow";
import { daysLeftIn, statusOf, type PressureStatus } from "./pressure";
import type { RecurringSeries } from "./recurring";
import type { Period } from "./types";

export type JarStatus = PressureStatus | "unknown";

/** Resolved income basis for percent-mode jars, with its own provenance. */
export interface IncomeBasis {
  value: number | "unknown";
  source: DataSource;
  freshness: string | null;
}

export interface JarLine {
  jarId: string;
  label: string;
  categoryIds: string[];
  /** null when percent-mode + income unknown (C1). */
  allocated: number | null;
  /** Σ max(0, netExpenseByCategory[cat]) — always the real posted spend. */
  used: number;
  /** null when `allocated` is null or non-positive (C1). */
  pct: number | null;
  daysLeft: number;
  /** "unknown" when the allocation could not be resolved (C1). */
  status: JarStatus;
  perCategory: { categoryId: string; label: string; used: number }[];
  meta: { source: DataSource; freshness: string | null };
  isUnassigned?: boolean;
}

const EXPENSE_LIKE: ReadonlySet<Transaction["type"]> = new Set(["expense", "fee", "refund"]);

function inPeriod(txn: Transaction, period: Period): boolean {
  return txn.postedAt >= period.from && txn.postedAt <= period.to;
}

const labelOf = (categoryId: string) => CATEGORY_BY_ID[categoryId]?.label ?? categoryId;

/** Worst-case source + oldest freshness over the posted spend feeding `catIds`. */
function foldProvenance(
  txns: Transaction[],
  period: Period,
  catIds: Set<string>,
  extra: IncomeBasis | null,
): { source: DataSource; freshness: string | null } {
  const sources: (DataSource | null)[] = [];
  const freshness: (string | null)[] = [];
  for (const t of txns) {
    if (t.status !== "posted" || !inPeriod(t, period)) continue;
    if (!catIds.has(t.categoryId) || !EXPENSE_LIKE.has(t.type)) continue;
    sources.push(t.source);
    freshness.push(t.postedAt);
  }
  if (extra) {
    sources.push(extra.source);
    freshness.push(extra.freshness);
  }
  return {
    source: lowestTrustSource(sources) ?? "mock",
    freshness: oldestFreshness(freshness),
  };
}

/**
 * Resolve the income basis for percent-mode jars. Priority (H7 — trailing-3-mo
 * tier cut): detected recurring salary → manual override → unknown. A manual
 * number is `self_reported`; unknown is the default first-run state.
 *
 * `data.transactions` MUST be the same array `recurring` was detected from
 * (correction-applied, not raw) so the salary series and the provenance rows
 * folded here can never diverge.
 */
export function resolveIncomeBasis(
  config: JarConfig,
  data: { transactions: Transaction[] },
  recurring: RecurringSeries[],
): IncomeBasis {
  const salary = recurring.find((s) => s.direction === "credit" && s.categoryId === "salary");
  if (salary) {
    const rows = data.transactions.filter(
      (t) =>
        t.status === "posted" &&
        t.direction === "credit" &&
        t.merchantNormalizedName === salary.merchantNormalizedName,
    );
    return {
      value: salary.averageAmount,
      source: lowestTrustSource(rows.map((t) => t.source)) ?? "mock",
      freshness: salary.lastPostedAt,
    };
  }
  if (typeof config.incomeBasis === "number") {
    return { value: config.incomeBasis, source: "self_reported", freshness: null };
  }
  return { value: "unknown", source: "estimated", freshness: null };
}

function buildJarLine(
  jar: JarConfig["jars"][number],
  byCat: Map<string, number>,
  txns: Transaction[],
  period: Period,
  daysLeft: number,
  income: IncomeBasis,
): JarLine {
  const perCategory = jar.categoryIds.map((categoryId) => ({
    categoryId,
    label: labelOf(categoryId),
    used: Math.max(0, byCat.get(categoryId) ?? 0),
  }));
  const used = perCategory.reduce((s, c) => s + c.used, 0);

  const isPercent = jar.allocation.mode === "percent";
  const allocated: number | null = isPercent
    ? income.value === "unknown"
      ? null
      : (income.value * jar.allocation.value) / 100
    : jar.allocation.value;

  const pct = allocated !== null && allocated > 0 ? used / allocated : null;
  const status: JarStatus = allocated === null ? "unknown" : statusOf(used, allocated);

  return {
    jarId: jar.id,
    label: jar.label,
    categoryIds: jar.categoryIds,
    allocated,
    used,
    pct,
    daysLeft,
    status,
    perCategory,
    meta: foldProvenance(txns, period, new Set(jar.categoryIds), isPercent ? income : null),
  };
}

/**
 * Evaluate all jars for a period. Empty config → no lines. Any expense category
 * with spend that no jar covers surfaces as a single neutral "Chưa phân hũ"
 * line (never dropped — invariant #6).
 */
export function evaluateJars(
  config: JarConfig,
  txns: Transaction[],
  period: Period,
  now: Date,
  income: IncomeBasis,
): JarLine[] {
  if (config.jars.length === 0) return [];

  const byCat = netExpenseByCategory(txns, period);
  const daysLeft = daysLeftIn(period, now);
  const assigned = new Set(config.jars.flatMap((j) => j.categoryIds));

  const lines = config.jars.map((jar) =>
    buildJarLine(jar, byCat, txns, period, daysLeft, income),
  );

  const unassigned = [...byCat.entries()]
    .filter(([catId, amount]) => !assigned.has(catId) && Math.max(0, amount) > 0)
    .map(([catId]) => catId);

  if (unassigned.length > 0) {
    const perCategory = unassigned.map((categoryId) => ({
      categoryId,
      label: labelOf(categoryId),
      used: Math.max(0, byCat.get(categoryId) ?? 0),
    }));
    lines.push({
      jarId: "unassigned",
      label: "Chưa phân hũ",
      categoryIds: unassigned,
      allocated: null,
      used: perCategory.reduce((s, c) => s + c.used, 0),
      pct: null,
      daysLeft,
      status: "unknown",
      perCategory,
      meta: foldProvenance(txns, period, new Set(unassigned), null),
      isUnassigned: true,
    });
  }

  return lines;
}
