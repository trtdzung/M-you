import "server-only";

/**
 * Read/write access to the `jars` table (see `data/jars/schema.md`) plus the shape
 * guard for a jar arriving in a request body. Server only — imported by the
 * route handlers under `src/app/api/jars/`, never by client code
 * (architectural invariant #4).
 *
 * A write is always a REPLACE of the persona's whole jar set inside one
 * transaction: every endpoint recomputes the full `JarConfig` in memory (via
 * `@/domain/jar-rules`) and hands it here, so persistence stays a single,
 * order-preserving code path instead of six bespoke UPDATE statements.
 */

import type { Jar, JarConfig } from "@/domain/models";
import { backfillActualAmount, dedupeCategories, healOrphanCategories } from "@/domain/jar-rules";
import { getDb } from "./db";

interface JarRow {
  id: string;
  cif: string;
  label: string;
  category_ids: string;
  budget_limit: number | null;
  actual_amount: number | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
}

/** Stored JSON text → category id array; a corrupt cell degrades to `[]`. */
function parseCategoryIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === "string");
  } catch {
    return [];
  }
}

/**
 * Row → domain jar. A NULL numeric column becomes `undefined` ("chưa đặt"),
 * never 0 (invariant #6); the same holds for the optional presentation columns,
 * which stay absent rather than becoming `null`.
 */
function toJar(row: JarRow): Jar {
  const jar: Jar = { id: row.id, label: row.label, categoryIds: parseCategoryIds(row.category_ids) };
  if (row.budget_limit !== null) jar.budgetLimit = row.budget_limit;
  if (row.actual_amount !== null) jar.actualAmount = row.actual_amount;
  if (row.color !== null) jar.color = row.color;
  if (row.icon !== null) jar.icon = row.icon;
  return jar;
}

/** A finite, non-negative amount, or `undefined` for anything else. */
function amount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Guard for a jar coming off the wire (the old provider-boundary `isValidJar`,
 * moved server-side): `id`/`label`/`categoryIds` are required, the two amounts
 * must be finite and non-negative or absent, and unknown fields are dropped —
 * so a malformed body can never write a NaN/negative/garbage row.
 */
export function sanitizeJar(input: unknown): Jar | null {
  if (typeof input !== "object" || input === null) return null;
  const j = input as Record<string, unknown>;
  if (typeof j.id !== "string" || j.id === "" || typeof j.label !== "string" || j.label === "") return null;
  const categoryIds = j.categoryIds ?? [];
  if (!Array.isArray(categoryIds) || !categoryIds.every((c) => typeof c === "string")) return null;

  const jar: Jar = { id: j.id, label: j.label, categoryIds: categoryIds as string[] };
  const budgetLimit = amount(j.budgetLimit);
  const actualAmount = amount(j.actualAmount);
  if (budgetLimit !== undefined) jar.budgetLimit = budgetLimit;
  if (actualAmount !== undefined) jar.actualAmount = actualAmount;
  if (typeof j.color === "string") jar.color = j.color;
  if (typeof j.icon === "string") jar.icon = j.icon;
  return jar;
}

/**
 * Guard for a PATCH body. Only the six mutable fields are honoured (`id` is the
 * path, never patchable) and an absent key is left alone.
 *
 * `null` means CLEAR — "Hạn mức: để trống" must be able to put `budgetLimit`
 * back to "chưa đặt", and `undefined` cannot survive `JSON.stringify`, so the
 * client sends `null` and it comes back out as an explicitly-present
 * `undefined` here (which the caller's spread merge then clears). A non-null but
 * invalid value (NaN, negative, wrong type) is ignored rather than written.
 */
export function sanitizeJarPatch(input: unknown): Partial<Omit<Jar, "id">> | null {
  if (typeof input !== "object" || input === null) return null;
  const p = input as Record<string, unknown>;
  const patch: Partial<Omit<Jar, "id">> = {};

  if (typeof p.label === "string" && p.label !== "") patch.label = p.label;
  if (Array.isArray(p.categoryIds) && p.categoryIds.every((c) => typeof c === "string")) {
    patch.categoryIds = p.categoryIds as string[];
  }
  for (const key of ["budgetLimit", "actualAmount"] as const) {
    if (!(key in p)) continue;
    if (p[key] === null) patch[key] = undefined;
    else {
      const value = amount(p[key]);
      if (value !== undefined) patch[key] = value;
    }
  }
  for (const key of ["color", "icon"] as const) {
    if (!(key in p)) continue;
    if (p[key] === null) patch[key] = undefined;
    else if (typeof p[key] === "string") patch[key] = p[key] as string;
  }
  return patch;
}

/** Same guard over a list; a single bad element rejects the whole list (a partial replace would silently drop jars). */
export function sanitizeJars(input: unknown): Jar[] | null {
  if (!Array.isArray(input)) return null;
  const jars: Jar[] = [];
  for (const item of input) {
    const jar = sanitizeJar(item);
    if (!jar) return null;
    jars.push(jar);
  }
  return jars;
}

/**
 * The persona's jars in display order, normalized (dedupe → heal → backfill)
 * on every call — this is what makes every route handler's response correct
 * regardless of how the underlying rows got there. An unknown `cif` (or one
 * that has never had a jar) does NOT yield an empty list: with zero stored
 * rows, `healOrphanCategories` sees every expense category as orphaned and
 * synthesizes a single catch-all "Khác" jar holding all of them (the same
 * healing that runs for any other persona) — this config is never a crash,
 * but callers should not assume "no rows" means "no jars back".
 */
export function readJarConfig(cif: string): JarConfig {
  const rows = getDb()
    .prepare("SELECT * FROM jars WHERE cif = ? ORDER BY sort_order ASC")
    .all(cif) as JarRow[];
  return backfillActualAmount(healOrphanCategories(dedupeCategories({ version: 3, jars: rows.map(toJar) })));
}

/**
 * Replace the persona's whole jar set, `sort_order` following array order, and
 * return the config as it now reads back from the database (so the response is
 * the stored truth, not the in-memory hope). Atomic — a failed insert rolls the
 * delete back rather than leaving the persona with no jars.
 */
export function writeJarConfig(cif: string, config: JarConfig): JarConfig {
  const db = getDb();
  const del = db.prepare("DELETE FROM jars WHERE cif = ?");
  const insert = db.prepare(
    `INSERT INTO jars (id, cif, label, category_ids, budget_limit, actual_amount, color, icon, sort_order)
     VALUES (@id, @cif, @label, @categoryIds, @budgetLimit, @actualAmount, @color, @icon, @sortOrder)`,
  );
  const replaceAll = db.transaction((jars: Jar[]) => {
    del.run(cif);
    jars.forEach((jar, index) => {
      insert.run({
        id: jar.id,
        cif,
        label: jar.label,
        categoryIds: JSON.stringify(jar.categoryIds),
        // `undefined` is not a bindable value in better-sqlite3 — an unset
        // amount is stored as NULL, which reads back as `undefined` again.
        budgetLimit: jar.budgetLimit ?? null,
        actualAmount: jar.actualAmount ?? null,
        color: jar.color ?? null,
        icon: jar.icon ?? null,
        sortOrder: index,
      });
    });
  });
  replaceAll(config.jars);
  return readJarConfig(cif);
}
