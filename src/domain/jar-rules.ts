/**
 * Pure jar business rules — the two invariants that used to live in
 * `src/state/jars.tsx` while jars were a `localStorage` blob. Jars now live in
 * SQLite and the API routes under `src/app/api/jars/` are the ONLY place these
 * run, so the server is the single source of truth: the client just renders the
 * `JarConfig` a route returns and never recomputes any of this.
 *
 * Framework-free (no React, no `server-only`, no storage) so a route handler can
 * import it directly. Behaviour is unchanged from the client-side versions.
 *
 *  - **One category, exactly one jar** (`stripCategories` / `dedupeCategories` /
 *    `healOrphanCategories`) — invariant #6, Σ-conservation: a category is never
 *    claimed twice (the engine would double-count its spend) and never dropped
 *    (an orphan is healed into the "Khác" jar).
 *
 * A jar carries NO stored balance: its spendable = max(0, remaining) is DERIVED
 * from txn history (invariant #1), so there is no `actualAmount` backfill/resync
 * here any more — `budgetLimit` is the only user-set number.
 */

import type { Jar, JarConfig } from "@/domain/models";
import { REBALANCE_CATEGORY, UNCLASSIFIED } from "@/domain/models";
import {
  EXPENSE_CATEGORY_IDS,
  KHAC_JAR_ID,
  KHAC_JAR_LABEL,
  orphanExpenseCategoryIds,
} from "@/domain/engine/category-jars";
import { POOL_DONOR_ID } from "@/domain/engine/jar-funding";

/**
 * Ids a user jar may never take (S9): the pool donor sentinel, the unclassified
 * group and the rebalance system category would collide with engine sentinels.
 * "Khác" is reserved on CREATE only — it is the system heal jar, so a full-set
 * replace (PUT) must be able to round-trip it.
 */
const ALWAYS_RESERVED_JAR_IDS: ReadonlySet<string> = new Set([POOL_DONOR_ID, UNCLASSIFIED, REBALANCE_CATEGORY]);

/** True when `id` is a sentinel a user jar cannot use (`creating` also reserves "khac"). */
export function isReservedJarId(id: string, creating: boolean): boolean {
  return ALWAYS_RESERVED_JAR_IDS.has(id) || (creating && id === KHAC_JAR_ID);
}

const EXPENSE_IDS: ReadonlySet<string> = new Set(EXPENSE_CATEGORY_IDS);

/** Ids in `catIds` that are not an expense category of the taxonomy (A11/A49). */
export function invalidExpenseCategoryIds(catIds: readonly string[]): string[] {
  return catIds.filter((c) => !EXPENSE_IDS.has(c));
}

/** Remove `catIds` from every jar except `exceptId` (keeps categories unique). */
export function stripCategories(jars: Jar[], catIds: string[], exceptId?: string): Jar[] {
  return jars.map((j) =>
    j.id === exceptId ? j : { ...j, categoryIds: j.categoryIds.filter((c) => !catIds.includes(c)) },
  );
}

/** A jar id not already taken (suffixes `-2`, `-3`… on collision). */
export function uniqueJarId(jars: Jar[], base: string): string {
  const taken = new Set(jars.map((j) => j.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Enforce the exactly-one invariant: any expense category no jar claims is moved
 * into the "Khác" jar (created if absent) so it is never dropped from
 * budgets/report (invariant #6, Σ-conservation). The "Khác" jar carries NO
 * `budgetLimit` — an unassigned catch-all has no meaningful monthly limit
 * (unknown, never 0). A no-op for a config that already covers every expense
 * category (every template does), so a fresh seed is untouched.
 */
export function healOrphanCategories(config: JarConfig): JarConfig {
  const orphans = orphanExpenseCategoryIds(config);
  if (orphans.length === 0) return config;
  const existing = config.jars.find((j) => j.id === KHAC_JAR_ID);
  if (existing) {
    return {
      ...config,
      jars: config.jars.map((j) =>
        j.id === KHAC_JAR_ID ? { ...j, categoryIds: [...j.categoryIds, ...orphans] } : j,
      ),
    };
  }
  const khac: Jar = {
    id: KHAC_JAR_ID,
    label: KHAC_JAR_LABEL,
    categoryIds: orphans,
  };
  return { ...config, jars: [...config.jars, khac] };
}

/**
 * Enforce one-category-one-jar on an arbitrary config (first jar to claim a
 * category keeps it). The mutators already guarantee this, but a jar set coming
 * from outside them — a template, a hand-edited row — has not been through
 * them, and `evaluateJarBudget` would double-count an overlap.
 */
export function dedupeCategories(config: JarConfig): JarConfig {
  const seen = new Set<string>();
  return {
    ...config,
    jars: config.jars.map((j) => ({
      ...j,
      categoryIds: j.categoryIds.filter((c) => (seen.has(c) ? false : (seen.add(c), true))),
    })),
  };
}
