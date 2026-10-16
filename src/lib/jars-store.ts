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

import type { Jar, JarConfig, JarRole } from "@/domain/models";
import { dedupeCategories, healOrphanCategories } from "@/domain/jar-rules";
import { getDb } from "./db";

/** The four donor-waterfall roles (plan 260918-1120, Phase 04 persistence). */
const JAR_ROLES: ReadonlySet<string> = new Set(["buffer", "spending", "essential", "goal"]);

function asRole(value: unknown): JarRole | undefined {
  return typeof value === "string" && JAR_ROLES.has(value) ? (value as JarRole) : undefined;
}

interface JarRow {
  id: string;
  cif: string;
  label: string;
  category_ids: string;
  budget_limit: number | null;
  role: string | null;
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
  const role = asRole(row.role);
  if (role) jar.role = role;
  if (row.color !== null) jar.color = row.color;
  if (row.icon !== null) jar.icon = row.icon;
  return jar;
}

/** A whole-VND, non-negative, safe-integer limit (S15/A24/A25/A09). */
function isValidLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Guard for a jar coming off the wire (the old provider-boundary `isValidJar`,
 * moved server-side): `id`/`label`/`categoryIds` are required, `budgetLimit`
 * must be a non-negative safe integer or absent/null (anything else REJECTS the
 * jar — never silently dropped), and unknown fields are dropped — so a
 * malformed body can never write a NaN/negative/fractional/garbage row.
 */
export function sanitizeJar(input: unknown): Jar | null {
  if (typeof input !== "object" || input === null) return null;
  const j = input as Record<string, unknown>;
  if (typeof j.id !== "string" || j.id === "" || typeof j.label !== "string" || j.label === "") return null;
  const categoryIds = j.categoryIds ?? [];
  if (!Array.isArray(categoryIds) || !categoryIds.every((c) => typeof c === "string")) return null;

  const jar: Jar = { id: j.id, label: j.label, categoryIds: categoryIds as string[] };
  if (j.budgetLimit !== undefined && j.budgetLimit !== null) {
    if (!isValidLimit(j.budgetLimit)) return null;
    jar.budgetLimit = j.budgetLimit;
  }
  const role = asRole(j.role);
  if (role) jar.role = role;
  if (typeof j.color === "string") jar.color = j.color;
  if (typeof j.icon === "string") jar.icon = j.icon;
  return jar;
}

/**
 * Guard for a PATCH body. Only the mutable fields are honoured (`id` is the
 * path, never patchable) and an absent key is left alone.
 *
 * `null` means CLEAR — "Hạn mức: để trống" must be able to put `budgetLimit`
 * back to "chưa đặt", and `undefined` cannot survive `JSON.stringify`, so the
 * client sends `null` and it comes back out as an explicitly-present
 * `undefined` here (which the caller's spread merge then clears). A non-null
 * `budgetLimit` that is not a non-negative safe integer (negative, fractional,
 * string, boolean, object) REJECTS the whole patch (`null` → 422): a swallowed bad
 * value would leave the client believing the write applied.
 */
export function sanitizeJarPatch(input: unknown): Partial<Omit<Jar, "id">> | null {
  if (typeof input !== "object" || input === null) return null;
  const p = input as Record<string, unknown>;
  const patch: Partial<Omit<Jar, "id">> = {};

  if (typeof p.label === "string" && p.label !== "") patch.label = p.label;
  if (Array.isArray(p.categoryIds) && p.categoryIds.every((c) => typeof c === "string")) {
    patch.categoryIds = p.categoryIds as string[];
  }
  if ("budgetLimit" in p) {
    if (p.budgetLimit === null || p.budgetLimit === undefined) patch.budgetLimit = undefined;
    else if (isValidLimit(p.budgetLimit)) patch.budgetLimit = p.budgetLimit;
    else return null;
  }
  if ("role" in p) {
    // `null` clears back to "unset" (engine treats it as `spending`); a valid role
    // string is honoured; anything else is ignored (never writes a garbage role).
    if (p.role === null) patch.role = undefined;
    else {
      const role = asRole(p.role);
      if (role) patch.role = role;
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
 * The persona's jars in display order, normalized (dedupe → heal) on every call
 * — this is what makes every route handler's response correct regardless of how
 * the underlying rows got there. An unknown `cif` (or one that has never had a
 * jar) does NOT yield an empty list: with zero stored rows,
 * `healOrphanCategories` sees every expense category as orphaned and synthesizes
 * a single catch-all "Khác" jar holding all of them (the same healing that runs
 * for any other persona) — this config is never a crash, but callers should not
 * assume "no rows" means "no jars back".
 */
export function readJarConfig(cif: string): JarConfig {
  const rows = getDb()
    .prepare("SELECT * FROM jars WHERE cif = ? ORDER BY sort_order ASC")
    .all(cif) as JarRow[];
  return healOrphanCategories(dedupeCategories({ version: 3, jars: rows.map(toJar) }));
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
    `INSERT INTO jars (id, cif, label, category_ids, budget_limit, role, color, icon, sort_order)
     VALUES (@id, @cif, @label, @categoryIds, @budgetLimit, @role, @color, @icon, @sortOrder)`,
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
        // limit is stored as NULL, which reads back as `undefined` again.
        budgetLimit: jar.budgetLimit ?? null,
        role: jar.role ?? null,
        color: jar.color ?? null,
        icon: jar.icon ?? null,
        sortOrder: index,
      });
    });
  });
  replaceAll(config.jars);
  return readJarConfig(cif);
}
