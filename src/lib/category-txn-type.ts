import { CATEGORY_BY_ID, type CategoryKind, type Transaction } from "@/domain/models";

/**
 * Derive a txn `type` from the category's KIND (never hardcoded) so the pair can
 * never drift (e.g. `categoryId:"transfer"` must be `type:"transfer"`, excluded
 * from spend). A jar with 0 categories resolves to the transfer category →
 * `type:"transfer"`, so an empty jar can never produce a phantom expense.
 *
 * `byId` is the taxonomy to resolve against — callers pass the persona's STORED
 * set (`useCategories().byId`), because a category the user created a second ago
 * is a real expense category and must be typed as one. The bundled presets are
 * the fallback for callers that have not been threaded yet.
 *
 * **An unresolved id resolves to `expense`, NEVER to `transfer`**, and that
 * direction is load-bearing: the engine EXCLUDES transfers from expense, so
 * guessing "transfer" for a category we simply do not recognise would quietly
 * erase real spend from every total (invariant #6). Guessing "expense" at worst
 * counts money the user did spend.
 */
export function typeForCategory(
  categoryId: string,
  byId?: ReadonlyMap<string, { kind: CategoryKind }>,
): Transaction["type"] {
  const kind = byId ? byId.get(categoryId)?.kind : CATEGORY_BY_ID[categoryId]?.kind;
  return kind === "transfer" ? "transfer" : "expense";
}
