/**
 * Pure rules for a USER-CREATED category: label normalisation, id generation,
 * conflict detection. The write-door validation that `src/lib/categories-store`
 * and `/api/categories` run, kept framework-free (no React, no `server-only`, no
 * DB) exactly like `src/domain/jar-rules.ts` — so a route handler, a test, or a
 * future client-side pre-check can all import it and agree.
 *
 * Two things are deliberately NOT here: anything that needs the stored taxonomy
 * (the caller passes the existing labels/ids in) and anything that writes.
 */

import { CATEGORIES, INCOME, REBALANCE_CATEGORY, UNCLASSIFIED } from "./categories";

/**
 * Max label length. A label is stored raw (NFC-trimmed) and rendered as a React
 * text node, so the cap is a storage/display bound, not an escaping mechanism —
 * never interpolate one into HTML, a `style` attribute or an AI prompt unescaped.
 */
export const MAX_CATEGORY_LABEL = 40;

/** Prefix on every user-created id — what makes a collision with a preset or a sentinel structurally impossible. */
export const CUSTOM_CATEGORY_PREFIX = "c_";

/**
 * Ids a category may never take: the three engine sentinels (`unclassified`,
 * `income`, `dieu-chinh-hu` — "missing label" / "money in" / "jar rebalance",
 * none of them a spending category), the pool donor sentinel and the "Khác"
 * system heal jar (both jar-side ids that share the id namespace in
 * `jars.category_ids` reasoning), plus every bundled preset id.
 */
const RESERVED_CATEGORY_IDS: ReadonlySet<string> = new Set([
  UNCLASSIFIED,
  INCOME,
  REBALANCE_CATEGORY,
  "pool",
  "khac",
  ...CATEGORIES.map((c) => c.id),
]);

/** True when `id` is a sentinel/preset id a user-created category may not take. */
export function isReservedCategoryId(id: string): boolean {
  return RESERVED_CATEGORY_IDS.has(id);
}

/**
 * Trim + NFC-normalise a label off the wire, or `null` when it is not a usable
 * one (not a string, empty/whitespace-only, or over `MAX_CATEGORY_LABEL`). NFC
 * first so "ắ" typed as one code point and as a+combining-mark are the SAME
 * stored label — otherwise the duplicate check below would let both through.
 * Rejects rather than truncating: silently storing half a label the user typed
 * would be a value we invented (invariant #6).
 */
export function normalizeCategoryLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const label = raw.normalize("NFC").trim();
  if (label.length === 0 || label.length > MAX_CATEGORY_LABEL) return null;
  return label;
}

/** NFC + lowercase fold used for the duplicate-label compare. */
function labelKey(label: string): string {
  return label.normalize("NFC").toLowerCase();
}

/**
 * True when `label` collides with one of `existing` (case-insensitive, NFC).
 *
 * Diacritics are deliberately NOT stripped: "Ăn uống" and "An uống" are
 * different Vietnamese words, and folding them together would refuse a legitimate
 * category. Case IS folded — "Học phí" and "học phí" are the same category typed
 * twice.
 */
export function labelConflict(label: string, existing: Iterable<string>): boolean {
  const key = labelKey(label);
  for (const other of existing) {
    if (labelKey(other) === key) return true;
  }
  return false;
}

/**
 * Label → `c_`-prefixed id. NFD → drop combining marks → `đ`/`Đ` → `d` (it is a
 * distinct letter, not a marked `d`, so the NFD pass cannot handle it) →
 * lowercase → collapse anything outside `[a-z0-9]` into `-` → trim `-`.
 *
 * The result is a whitelist by construction (`c_` + `[a-z0-9-]`), which is what
 * lets the server ignore any client-supplied id outright. A label with no
 * ASCII-able characters at all (emoji-only, pure CJK) yields an empty slug and
 * falls back to a base-36 timestamp so it still gets a stable, storable id
 * instead of being rejected.
 */
export function slugCategoryId(label: string, now: number = Date.now()): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${CUSTOM_CATEGORY_PREFIX}${slug === "" ? now.toString(36) : slug}`;
}

/** `base`, or the first free `base-2`, `base-3`… when it is already taken. */
export function uniqueCategoryId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
