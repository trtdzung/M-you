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
import { dedupeCategories, isJarAmount } from "@/domain/jar-rules";
import { getDb } from "./db";
import { transferNow } from "./demo-clock";
import { deleteLedgerExcept, readJarLedger } from "./jar-ledger-store";

interface JarRow {
  id: string;
  cif: string;
  label: string;
  category_ids: string;
  budget_limit: number | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  /** Running-balance anchor (ISO). NULL only on a not-yet-migrated legacy row. */
  created_at: string | null;
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
  if (row.color !== null) jar.color = row.color;
  if (row.icon !== null) jar.icon = row.icon;
  if (row.created_at !== null) jar.createdAt = row.created_at;
  return jar;
}

/** A whole-VND, non-negative, safe-integer limit ≤ `MAX_JAR_AMOUNT` (S15/A24/A25/A09, RT#12). */
function isValidLimit(value: unknown): value is number {
  return isJarAmount(value);
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
  for (const key of ["color", "icon"] as const) {
    if (!(key in p)) continue;
    if (p[key] === null) patch[key] = undefined;
    else if (typeof p[key] === "string") patch[key] = p[key] as string;
  }
  return patch;
}

/**
 * Guard for a `POST /api/jars` body (plan 260923, D2): the jar must pass
 * `sanitizeJar`, and `balance` (the opening deposit) is REQUIRED whole VND in
 * `[0, MAX_JAR_AMOUNT]` — a missing balance is never defaulted to 0 by the server
 * (invariant #6); the caller answers 422 with `error`. `budgetLimit` is OPTIONAL:
 * a jar with nothing to plan (e.g. "Tiết kiệm") is created with no limit — stored
 * as null, "chưa đặt" — and an explicit opening balance of 0.
 */
export function sanitizeJarCreate(
  body: unknown,
): { jar: Jar; balance: number } | { error: string } {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const jar = sanitizeJar(b.jar);
  if (!jar) return { error: "jar is invalid" };
  if (!isJarAmount(b.balance)) return { error: "balance is required (whole VND, 0 to 10^12)" };
  return { jar, balance: b.balance };
}

/**
 * Ids of the persona's jars that have a REAL `jars` row — i.e. excluding the
 * synthetic "Khác" the old `readJarConfig` healed in on the fly. Ledger writes are allowed
 * only for these (Red Team #5): a row-less jar has no anchor to hold a balance.
 */
export function readJarRowIds(cif: string): Set<string> {
  const rows = getDb().prepare("SELECT id FROM jars WHERE cif = ?").all(cif) as { id: string }[];
  return new Set(rows.map((r) => r.id));
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
 * The persona's jars in display order, deduped (one category, at most one jar) on
 * every call — this is what makes every route handler's response correct
 * regardless of how the underlying rows got there. An unknown `cif` (or one that
 * has never had a jar) yields an empty list. Nothing is invented for a category
 * that no jar claims (a new category, or one whose jar was deleted): it is simply
 * "chưa xếp hũ" — its spend still counts in the reports, under their own
 * "Chưa xếp hũ" group, never silently dropped.
 */
export function readJarConfig(cif: string): JarConfig {
  const rows = getDb().prepare("SELECT * FROM jars WHERE cif = ? ORDER BY sort_order ASC").all(cif) as JarRow[];
  const config = dedupeCategories({ version: 3, jars: rows.map(toJar) });
  // Ledger attached AFTER dedupe — it rebuilds the config object.
  return { ...config, ledger: readJarLedger(cif) };
}

/**
 * Replace the persona's whole jar set, `sort_order` following array order, and
 * return the config as it now reads back from the database (so the response is
 * the stored truth, not the in-memory hope). Atomic — a failed insert rolls the
 * delete back rather than leaving the persona with no jars.
 *
 * `created_at` is server-owned: an existing jar keeps its stored anchor across
 * the DELETE+INSERT (read by id first); a new id gets `nowIso`. Any `createdAt`
 * or `ledger` on the incoming config is ignored. Ledger rows of a jar that left
 * the config are deleted in the same transaction (a reused id must not inherit a
 * stale balance).
 */
export function writeJarConfig(
  cif: string,
  config: JarConfig,
  nowIso: string = transferNow().toISOString(),
): JarConfig {
  const db = getDb();
  const readAnchors = db.prepare("SELECT id, created_at FROM jars WHERE cif = ?");
  const del = db.prepare("DELETE FROM jars WHERE cif = ?");
  const insert = db.prepare(
    `INSERT INTO jars (id, cif, label, category_ids, budget_limit, color, icon, sort_order, created_at)
     VALUES (@id, @cif, @label, @categoryIds, @budgetLimit, @color, @icon, @sortOrder, @createdAt)`,
  );
  const replaceAll = db.transaction((jars: Jar[]) => {
    const rows = readAnchors.all(cif) as Pick<JarRow, "id" | "created_at">[];
    const anchors = new Map(rows.map((r) => [r.id, r.created_at]));
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
        color: jar.color ?? null,
        icon: jar.icon ?? null,
        sortOrder: index,
        createdAt: anchors.get(jar.id) ?? nowIso,
      });
    });
    deleteLedgerExcept(cif, jars.map((j) => j.id));
  });
  replaceAll(config.jars);
  return readJarConfig(cif);
}
