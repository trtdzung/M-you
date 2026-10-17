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
 *  - **One category, AT MOST one jar** (`stripCategories` / `dedupeCategories`) —
 *    invariant #6, Σ-conservation: a category is never claimed twice (the engine
 *    would double-count its spend). A category in NO jar is legal ("chưa xếp hũ",
 *    e.g. after its jar was deleted): its spend is never dropped — the report
 *    groups it under "Chưa xếp hũ" (`groupSpendingByJar`) — it just belongs to no
 *    jar's budget.
 *
 * A jar carries NO stored balance: its balance is DERIVED by the engine from the
 * `jar_ledger` rows + txn history since its anchor (`jar-balance.ts`, invariant #1),
 * and spendable = max(0, balance). `budgetLimit` is the monthly plan, not money.
 */

import type { Jar, JarConfig } from "@/domain/models";
import { REBALANCE_CATEGORY, UNCLASSIFIED } from "@/domain/models";
import { KHAC_JAR_ID } from "@/domain/engine/category-jars";
import { POOL_DONOR_ID } from "@/domain/engine/jar-funding";

/**
 * Ids a user jar may never take (S9): the pool donor sentinel, the unclassified
 * group and the rebalance system category would collide with engine sentinels.
 * "khac" (the id of the report's "Chưa xếp hũ" group) is reserved on CREATE only;
 * a legacy stored jar with that id must still round-trip a full-set replace (PUT).
 */
const ALWAYS_RESERVED_JAR_IDS: ReadonlySet<string> = new Set([POOL_DONOR_ID, UNCLASSIFIED, REBALANCE_CATEGORY]);

/**
 * Ceiling for any single jar money figure (limit, opening balance, ledger entry)
 * and for a ledger batch total: 10^12 VND. Far above any real persona, low enough
 * that sums of a few stay exact safe integers (Red Team #12).
 */
export const MAX_JAR_AMOUNT = 1_000_000_000_000;

/** A whole-VND safe integer in `[0, MAX_JAR_AMOUNT]`. */
export function isJarAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_JAR_AMOUNT;
}

/** True when `id` is a sentinel a user jar cannot use (`creating` also reserves "khac"). */
export function isReservedJarId(id: string, creating: boolean): boolean {
  return ALWAYS_RESERVED_JAR_IDS.has(id) || (creating && id === KHAC_JAR_ID);
}

/**
 * Ids in `catIds` that are not an expense category of the taxonomy (A11/A49).
 *
 * `knownIds` is the taxonomy to validate against and is REQUIRED. The jar write
 * doors pass the persona's STORED set (`knownExpenseCategoryIds(cif)`) so a
 * category the user created a second ago is immediately assignable, and so
 * persona A's id can never validate for persona B. There is deliberately no
 * bundled-preset default: it would have rejected every custom category at the
 * write door with a 422 that reads like the id was invented.
 */
export function invalidExpenseCategoryIds(
  catIds: readonly string[],
  knownIds: ReadonlySet<string>,
): string[] {
  return catIds.filter((c) => !knownIds.has(c));
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
 * Ids of the jars a full-set replace (`PUT /api/jars` — template apply / restore
 * defaults) would DELETE while they still hold ≥ 1 ledger row (Red Team #11). The
 * replace drops those rows with the jar, so the user must confirm the balance loss
 * first. In `config.jars` order; empty when nothing funded is removed.
 */
export function jarsLosingBalance(config: JarConfig, nextJars: readonly Jar[]): string[] {
  const kept = new Set(nextJars.map((j) => j.id));
  const funded = new Set((config.ledger ?? []).map((e) => e.jarId));
  return config.jars.filter((j) => !kept.has(j.id) && funded.has(j.id)).map((j) => j.id);
}
