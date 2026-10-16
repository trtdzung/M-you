/**
 * Duplicate-label detection for the settings screens. Under exactly-one every
 * expense category already lives in exactly one jar, so this does NOT dedupe
 * assignment — it flags two *labels* that read as the same (a hũ named "Ăn uống"
 * created twice, or a future user category colliding with a preset). Pure and
 * order-stable so a ⚠ flag and a create-time block agree. Never auto-merges —
 * merging is a user decision (we only warn), so a legitimately repeated name is
 * possible, just surfaced.
 */

/** Fold a label for comparison: trim, collapse spaces, lowercase, strip accents. */
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export interface LabelledItem {
  id: string;
  label: string;
}

/**
 * Group ids whose labels normalize to the same key, keeping only the groups with
 * a real collision (2+ members). Groups + members stay in input order.
 */
export function findDuplicateLabels(items: LabelledItem[]): { key: string; ids: string[] }[] {
  const byKey = new Map<string, string[]>();
  for (const item of items) {
    const key = normalizeLabel(item.label);
    if (key === "") continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(item.id);
    else byKey.set(key, [item.id]);
  }
  const groups: { key: string; ids: string[] }[] = [];
  for (const [key, ids] of byKey) {
    if (ids.length > 1) groups.push({ key, ids });
  }
  return groups;
}

/** The set of ids that share a label with at least one other item (for a ⚠). */
export function duplicateLabelIds(items: LabelledItem[]): Set<string> {
  const ids = new Set<string>();
  for (const group of findDuplicateLabels(items)) {
    for (const id of group.ids) ids.add(id);
  }
  return ids;
}

/**
 * Whether adding `candidate` would collide with an existing label (create-time
 * block). Ignores the item being renamed via `exceptId`.
 */
export function isDuplicateLabel(
  candidate: string,
  existing: LabelledItem[],
  exceptId?: string,
): boolean {
  const key = normalizeLabel(candidate);
  if (key === "") return false;
  return existing.some((item) => item.id !== exceptId && normalizeLabel(item.label) === key);
}
