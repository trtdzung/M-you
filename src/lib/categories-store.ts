import "server-only";

/**
 * Read access to the `categories` table (see `data/schema.md`) — the stored
 * category taxonomy. Server only (architectural invariant #4).
 *
 * Seeded from `CATEGORIES` (`src/domain/models/categories.ts`) with
 * `INSERT OR IGNORE`: a category added in code shows up on the next read, while
 * an existing row is never clobbered. Sentinels (`unclassified`, `income`,
 * `dieu-chinh-hu`) are not categories and are never stored.
 */

import { CATEGORIES, type CategoryDef } from "@/domain/models";
import { getDb } from "./db";

interface CategoryRow {
  id: string;
  label: string;
  kind: string;
  fixed: number;
}

function ensureSeeded(): void {
  const db = getDb();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO categories (id, label, kind, fixed, sort_order) VALUES (@id, @label, @kind, @fixed, @sortOrder)",
  );
  db.transaction(() => {
    CATEGORIES.forEach((c, index) => insert.run({ id: c.id, label: c.label, kind: c.kind, fixed: c.fixed ? 1 : 0, sortOrder: index }));
  })();
}

/** The taxonomy in display order. */
export function readCategories(): CategoryDef[] {
  ensureSeeded();
  const rows = getDb().prepare("SELECT id, label, kind, fixed FROM categories ORDER BY sort_order ASC, id ASC").all() as CategoryRow[];
  return rows.map((r) => ({ id: r.id, label: r.label, kind: r.kind as CategoryDef["kind"], fixed: r.fixed === 1 }));
}

/** The set of valid category ids (for validating a label before it is stored). */
export function categoryIdSet(): Set<string> {
  return new Set(readCategories().map((c) => c.id));
}
