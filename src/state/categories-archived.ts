/**
 * Pure taxonomy reconciliation for `CategoryTaxonomyProvider`. Kept out of the
 * provider (and framework-free) so the one rule that decides whether a label
 * survives a write can be read — and tested — on its own.
 */

import type { StoredCategory } from "@/domain/models";

/**
 * A write answers with the ACTIVE taxonomy only. Re-attach the archived rows we
 * already know about (minus the one this write deleted) so hiding a category
 * never costs us its label: a transaction the user labelled last month must keep
 * rendering that label, not a raw id (invariant #5). A row missing from the
 * response and not deleted can only be archived, so it is flagged as such.
 */
export function withKnownArchived(
  prev: StoredCategory[],
  next: StoredCategory[],
  deletedId?: string,
): StoredCategory[] {
  const active = new Set(next.map((c) => c.id));
  const hidden = prev
    .filter((c) => !active.has(c.id) && c.id !== deletedId)
    .map((c) => ({ ...c, archived: true as const }));
  return [...next, ...hidden];
}
