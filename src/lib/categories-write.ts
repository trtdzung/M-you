import "server-only";

/**
 * WRITE access to the `categories` table — create / rename / archive / delete a
 * persona's own category. Server only (invariant #4); the read path lives in
 * `categories-store.ts` (which `jars-store` calls, so keeping the mutations here
 * avoids an import cycle: write → jars-store → categories-store).
 *
 * Two rules shape every function below.
 *
 *  - **One transaction per mutation.** A category write is really TWO writes —
 *    the `categories` row and the persona's whole jar set — and a half-applied
 *    pair would leave a jar pointing at a category that does not exist (an
 *    inflated "n danh mục" count and a ghost chip). They go through one
 *    `better-sqlite3` transaction; a `WriteAbort` thrown inside rolls both back.
 *  - **Every mutation returns the whole aggregate** (`{ categories, jarConfig }`),
 *    the same contract the `/api/jars` routes already use, so the client renders
 *    the server's truth instead of re-fetching into a race.
 *
 * Label/shape validation (length, `kind`, reserved jar id) is the route's job;
 * everything here assumes an already-normalised label. Ids are NEVER taken from
 * the client — they come from the `c_` + `[a-z0-9-]` slug whitelist in
 * `@/domain/models/category-rules`.
 */

import type { JarConfig } from "@/domain/models";
import { isReservedCategoryId, labelConflict, slugCategoryId, uniqueCategoryId } from "@/domain/models/category-rules";
import { stripCategories } from "@/domain/jar-rules";
import { categoryUsageCount, readCategories, readCategory, type StoredCategory } from "./categories-store";
import { getDb } from "./db";
import { readJarConfig, writeJarConfig } from "./jars-store";

/**
 * Why a write was refused. `category-write-guards.ts` maps each code to its HTTP
 * status: `duplicate-label` (another active OR archived row of this cif holds the
 * label) and `in-use` (rows still reference it — the remedy is
 * `PATCH { archived: true }`) are 409s, `built-in` (a preset is immutable through
 * the API) is a 403, the two not-founds are 404s.
 */
export type CategoryFailure =
  | { code: "duplicate-label" }
  | { code: "built-in" }
  | { code: "not-found" }
  | { code: "jar-not-found" }
  | { code: "in-use"; usedBy: number };

export type CategoryWriteResult =
  | { ok: true; categories: StoredCategory[]; jarConfig: JarConfig }
  | { ok: false; failure: CategoryFailure };

/** Thrown inside a transaction to roll it back with a caller-facing reason. */
class WriteAbort extends Error {
  constructor(readonly failure: CategoryFailure) {
    super(failure.code);
    this.name = "WriteAbort";
  }
}

type Aggregate = { categories: StoredCategory[]; jarConfig: JarConfig };

/** The resulting aggregate: the taxonomy as stored plus the jar set as stored. */
function aggregate(cif: string, jarConfig: JarConfig): Aggregate {
  return { categories: readCategories(cif), jarConfig };
}

/** Run `fn` in ONE transaction, turning a `WriteAbort` into a rolled-back failure. */
function transact(fn: () => Aggregate): CategoryWriteResult {
  try {
    return { ok: true, ...getDb().transaction(fn)() };
  } catch (err) {
    if (err instanceof WriteAbort) return { ok: false, failure: err.failure };
    throw err;
  }
}

/** The custom row, or an abort: 404 when absent, 403 when it is a bundled preset. */
function requireCustom(cif: string, id: string): { label: string; archived: boolean } {
  const row = readCategory(cif, id);
  if (!row) throw new WriteAbort({ code: "not-found" });
  if (!row.custom) throw new WriteAbort({ code: "built-in" });
  return { label: row.label, archived: row.archived === true };
}

/** Abort when `label` collides with any OTHER category of this cif (active or archived). */
function assertLabelFree(cif: string, label: string, exceptId?: string): void {
  const others = readCategories(cif, { includeArchived: true })
    .filter((c) => c.id !== exceptId)
    .map((c) => c.label);
  if (labelConflict(label, others)) throw new WriteAbort({ code: "duplicate-label" });
}

/**
 * Create a user category for `cif`. `kind` is forced to `expense` — the transfer
 * category is a system concept the engine uses to EXCLUDE a txn from spend.
 *
 * With no `jarId` the row is inserted and the jar set re-read unchanged: the new
 * category is "chưa xếp hũ" (in no jar). With a `jarId` the id is appended to that
 * jar instead.
 */
export function insertCategory(
  cif: string,
  input: { label: string; fixed: boolean; jarId?: string },
): CategoryWriteResult {
  return transact(() => {
    assertLabelFree(cif, input.label);
    const taken = readCategories(cif, { includeArchived: true }).map((c) => c.id);
    const id = uniqueCategoryId(slugCategoryId(input.label), taken);
    // Structurally impossible (the `c_` prefix), asserted so a future change to
    // the slug rules can never quietly mint a sentinel id.
    if (isReservedCategoryId(id)) throw new Error(`generated reserved category id ${id}`);

    const before = readJarConfig(cif);
    if (input.jarId !== undefined && !before.jars.some((j) => j.id === input.jarId)) {
      throw new WriteAbort({ code: "jar-not-found" });
    }

    const { next } = getDb()
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories WHERE cif = @cif")
      .get({ cif }) as { next: number };
    getDb()
      .prepare(
        `INSERT INTO categories (cif, id, label, kind, fixed, custom, archived_at, sort_order)
         VALUES (@cif, @id, @label, 'expense', @fixed, 1, NULL, @sortOrder)`,
      )
      .run({ cif, id, label: input.label, fixed: input.fixed ? 1 : 0, sortOrder: next });

    const jars =
      input.jarId === undefined
        ? readJarConfig(cif).jars // no jar claims the new category — "chưa xếp hũ"
        : before.jars.map((j) => (j.id === input.jarId ? { ...j, categoryIds: [...j.categoryIds, id] } : j));
    return aggregate(cif, writeJarConfig(cif, { version: 3, jars }));
  });
}

/**
 * Rename / re-flag / archive one CUSTOM category. `id` is immutable — a
 * `patch.id` never reaches here. Archiving keeps the jar membership (heal only
 * ever adds, so the id stays put and no historical jar total moves);
 * un-archiving re-runs the duplicate-label check and lets the heal re-home it if
 * the jar set lost it in the meantime.
 */
export function patchCategory(
  cif: string,
  id: string,
  patch: { label?: string; fixed?: boolean; archived?: boolean },
): CategoryWriteResult {
  return transact(() => {
    const row = requireCustom(cif, id);
    const nextLabel = patch.label ?? row.label;
    if (patch.label !== undefined || patch.archived === false) assertLabelFree(cif, nextLabel, id);

    const sets: string[] = [];
    const params: Record<string, string | number | null> = { cif, id };
    if (patch.label !== undefined) {
      sets.push("label = @label");
      params.label = nextLabel;
    }
    if (patch.fixed !== undefined) {
      sets.push("fixed = @fixed");
      params.fixed = patch.fixed ? 1 : 0;
    }
    if (patch.archived !== undefined) {
      sets.push("archived_at = @archivedAt");
      params.archivedAt = patch.archived ? new Date().toISOString() : null;
    }
    if (sets.length > 0) {
      getDb().prepare(`UPDATE categories SET ${sets.join(", ")} WHERE cif = @cif AND id = @id`).run(params);
    }
    return aggregate(cif, writeJarConfig(cif, readJarConfig(cif)));
  });
}

/**
 * Hard-delete one UNUSED custom category and strip it from every jar of this cif
 * in the SAME transaction (a dangling id in `jars.category_ids` would inflate the
 * "n danh mục" count and the chip list). A category any `transactions` or
 * `transaction_corrections` row still points at is refused with its usage count —
 * reassigning that history to `unclassified` would silently move past spend out
 * of a real jar (#5, #6). The remedy is `archived: true`.
 */
export function deleteCategory(cif: string, id: string): CategoryWriteResult {
  return transact(() => {
    requireCustom(cif, id);
    const usedBy = categoryUsageCount(cif, id);
    if (usedBy > 0) throw new WriteAbort({ code: "in-use", usedBy });

    getDb().prepare("DELETE FROM categories WHERE cif = @cif AND id = @id").run({ cif, id });
    // Read AFTER the delete: the id is no longer assignable, so the heal cannot
    // put it straight back; `stripCategories` then removes it from its jar.
    const jars = stripCategories(readJarConfig(cif).jars, [id]);
    return aggregate(cif, writeJarConfig(cif, { version: 3, jars }));
  });
}
