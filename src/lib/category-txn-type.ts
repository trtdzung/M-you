import { CATEGORY_BY_ID, type Transaction } from "@/domain/models";

/**
 * Derive a txn `type` from the category's KIND (never hardcoded) so the pair can
 * never drift (e.g. `categoryId:"transfer"` must be `type:"transfer"`, excluded
 * from spend). A category with no/unknown kind falls back to `expense`; a jar
 * with 0 categories resolves to the transfer category → `type:"transfer"`, so an
 * empty jar can never produce a phantom expense.
 */
export function typeForCategory(categoryId: string): Transaction["type"] {
  const kind = CATEGORY_BY_ID[categoryId]?.kind;
  return kind === "transfer" ? "transfer" : kind === "income" ? "income" : "expense";
}
