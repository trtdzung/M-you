import { isRebalanceCategory, type Transaction } from "@/domain/models";

/**
 * The "điều chỉnh hũ" rebalance legs touching `jarId` (as donor OR target) — the
 * rows the server deletes together with the jar (plan decision S8/A47/U8), so
 * the delete confirm can warn before they vanish.
 */
export function rebalanceLegsForJar(txns: Transaction[], jarId: string): Transaction[] {
  return txns.filter(
    (t) =>
      isRebalanceCategory(t.categoryId) &&
      t.rebalance != null &&
      (t.rebalance.fromJarId === jarId || t.rebalance.toJarId === jarId),
  );
}

/** Ids of the OTHER jars (incl. the "pool") those legs move money from/to. */
export function linkedJarIds(legs: Transaction[], jarId: string): string[] {
  const ids = new Set<string>();
  for (const t of legs) {
    if (!t.rebalance) continue;
    for (const id of [t.rebalance.fromJarId, t.rebalance.toJarId]) if (id !== jarId) ids.add(id);
  }
  return [...ids];
}
