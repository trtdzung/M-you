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
 *  - **`actualAmount` backfills from `budgetLimit`** (`backfillActualAmount`) —
 *    applied after EVERY mutation, not just on load, so a jar that just got its
 *    first limit is immediately usable as a transfer source.
 */

import type { Jar, JarConfig } from "@/domain/models";
import { KHAC_JAR_ID, KHAC_JAR_LABEL, orphanExpenseCategoryIds } from "@/domain/engine/category-jars";

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

/**
 * A jar that has a `budgetLimit` but no `actualAmount` yet starts with a real
 * balance equal to its set amount, so it is usable as a transfer source
 * immediately instead of requiring a separate funding step. A jar with no
 * `budgetLimit` (e.g. "Tiết kiệm") stays `actualAmount: undefined` — never
 * defaulted to 0 (invariant #6). Idempotent.
 */
export function backfillActualAmount(config: JarConfig): JarConfig {
  return {
    ...config,
    jars: config.jars.map((j) =>
      j.budgetLimit !== undefined && j.actualAmount === undefined ? { ...j, actualAmount: j.budgetLimit } : j,
    ),
  };
}
