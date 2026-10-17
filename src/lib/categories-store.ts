import "server-only";

/**
 * READ access to the `categories` table (see `data/schema.md`) — the stored
 * category taxonomy, PER PERSONA (`cif`). Server only (architectural invariant
 * #4). The mutations live in `categories-write.ts` so this file stays the one
 * cheap, dependency-free read path that `jars-store` can call on every read
 * without pulling the write machinery in (and without an import cycle).
 *
 * Seeded lazily PER CIF from `CATEGORIES` (`src/domain/models/categories.ts`)
 * with `INSERT OR IGNORE`: a category added in code shows up on the next read
 * for every persona, while an existing (possibly renamed) row is never clobbered.
 * Sentinels (`unclassified`, `income`, `dieu-chinh-hu`) are not categories and
 * are never stored.
 */

import { CATEGORIES, type CategoryDef, type StoredCategory } from "@/domain/models";
import { getDb } from "./db";

/**
 * The wire shape (`CategoryDef` + `archived`) lives in `@/domain/models` so the
 * provider interfaces and the client taxonomy state — neither of which may import
 * this `server-only` module — share one definition. Re-exported here because the
 * write path and the routes already read it from the store.
 */
export type { StoredCategory };

/** `readCategory`'s single-row view; `custom` drives the built-in write lock (403). */
export interface StoredCategoryRow extends StoredCategory {
  /** `false` on a bundled preset (rename/delete-locked), `true` on a user-created one. */
  custom: boolean;
}

interface CategoryRow {
  id: string;
  label: string;
  kind: string;
  fixed: number;
  custom: number;
  archived_at: string | null;
}

const SELECT_COLUMNS = "id, label, kind, fixed, custom, archived_at";

/**
 * Seed the bundled presets for `cif` if they are not there yet. Runs on every
 * read (it is a no-op INSERT OR IGNORE inside one transaction) rather than at
 * some setup step, so a persona that has never been touched — a fresh demo cif,
 * a synthetic test cif — still has a full taxonomy the first time anything asks.
 */
function ensureSeeded(cif: string): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO categories (cif, id, label, kind, fixed, custom, archived_at, sort_order)
     VALUES (@cif, @id, @label, @kind, @fixed, 0, NULL, @sortOrder)`,
  );
  db.transaction(() => {
    CATEGORIES.forEach((c, index) =>
      insert.run({ cif, id: c.id, label: c.label, kind: c.kind, fixed: c.fixed ? 1 : 0, sortOrder: index }),
    );
  })();
}

function toStored(row: CategoryRow): StoredCategoryRow {
  const category: StoredCategoryRow = {
    id: row.id,
    label: row.label,
    kind: row.kind as CategoryDef["kind"],
    fixed: row.fixed === 1,
    custom: row.custom === 1,
  };
  if (row.archived_at !== null) category.archived = true;
  return category;
}

/** Drop `custom` — it is a write-door concern, not part of the taxonomy contract. */
function toPublic({ custom: _custom, ...category }: StoredCategoryRow): StoredCategory {
  return category;
}

/**
 * The persona's taxonomy in display order. ACTIVE only by default — an archived
 * category must never reappear in a picker. `includeArchived` adds the archived
 * rows (flagged `archived: true`) for the manage/un-archive surfaces.
 */
export function readCategories(cif: string, opts?: { includeArchived?: boolean }): StoredCategory[] {
  ensureSeeded(cif);
  const where = opts?.includeArchived ? "" : " AND archived_at IS NULL";
  const rows = getDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM categories WHERE cif = @cif${where} ORDER BY sort_order ASC, id ASC`)
    .all({ cif }) as CategoryRow[];
  return rows.map((row) => toPublic(toStored(row)));
}

/** One row, archived or not — `null` when this persona has no such category. */
export function readCategory(cif: string, id: string): StoredCategoryRow | null {
  ensureSeeded(cif);
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM categories WHERE cif = @cif AND id = @id`)
    .get({ cif, id }) as CategoryRow | undefined;
  return row ? toStored(row) : null;
}

/**
 * ACTIVE EXPENSE ids — the set a category may be PUT INTO a jar from: the jar
 * pickers and `healOrphanCategories`' "every expense category belongs to exactly
 * one jar" sweep. Archived ids are excluded on purpose: heal only ever ADDS, so
 * an archived category already in a jar stays exactly where it is (its historical
 * jar totals never move) while never being re-offered.
 */
export function assignableCategoryIds(cif: string): Set<string> {
  return new Set(readCategories(cif).filter((c) => c.kind === "expense").map((c) => c.id));
}

/**
 * ACTIVE ∪ ARCHIVED expense ids — the set a jar write is VALIDATED against.
 * Wider than `assignable` so a jar that already holds an archived category can
 * still be saved (a PATCH sends the jar's full `categoryIds`); narrower than
 * `known` so `transfer` — a system concept, not a spending category — can never
 * be dropped into a jar and typed as non-expense by the engine.
 */
export function knownExpenseCategoryIds(cif: string): Set<string> {
  return new Set(
    readCategories(cif, { includeArchived: true }).filter((c) => c.kind === "expense").map((c) => c.id),
  );
}

/**
 * EVERY id this persona knows — active ∪ archived, expense ∪ transfer. Used to
 * validate a stored label (`corrections-store`): a correction may legitimately
 * name the `transfer` category, and an archived id must keep round-tripping or a
 * user's historical label would be rejected on the next write.
 */
export function knownCategoryIds(cif: string): Set<string> {
  return new Set(readCategories(cif, { includeArchived: true }).map((c) => c.id));
}

/**
 * How many stored records still point at this category for this persona:
 * `transactions` rows (bank + self-reported) plus `transaction_corrections`
 * payloads. This is the DELETE gate — a category some row references is archived,
 * never hard-deleted, because rewriting those rows to `unclassified` would move
 * real historical spend out of a real jar with no notice (invariants #5, #6).
 */
export function categoryUsageCount(cif: string, id: string): number {
  const db = getDb();
  const txns = db
    .prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = @cif AND json_extract(payload, '$.categoryId') = @id")
    .get({ cif, id }) as { n: number };
  const corrections = db
    .prepare(
      "SELECT COUNT(*) AS n FROM transaction_corrections WHERE cif = @cif AND json_extract(payload, '$.categoryId') = @id",
    )
    .get({ cif, id }) as { n: number };
  return txns.n + corrections.n;
}
