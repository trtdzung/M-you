/**
 * Which transactions are eligible for AI category enrichment.
 *
 * A transaction is "unclassified" (needs a label) only when it carries the
 * `UNCLASSIFIED` sentinel AND its `type` is one the taxonomy can actually label
 * — expense (income was removed from the product). Structural types (transfer /
 * card_payment / fee / refund) are NEVER labelled by the assistant (Red Team
 * #4): they are excluded from spend truth and map to no spending category, so
 * the classifier must not invent one for them. This is the single gate every
 * trigger + validator reuses, so eligibility can never diverge across the pipeline.
 */

import type { Transaction } from "@/domain/models";
import { UNCLASSIFIED } from "@/domain/models";

/** Transaction types the assistant may propose a category for. */
const AI_ELIGIBLE_TYPES: ReadonlySet<Transaction["type"]> = new Set(["expense"]);

/** True when a transaction lacks a label AND its type is AI-eligible. */
export function isUnclassified(txn: Transaction): boolean {
  return txn.categoryId === UNCLASSIFIED && AI_ELIGIBLE_TYPES.has(txn.type);
}
