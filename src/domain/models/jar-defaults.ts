/**
 * Default spending-jar template used on first run / reset. Spend-only (AD1/AD6):
 * it maps ONLY real expense categories and covers all ten, so every spend lands
 * in a jar and "Chưa phân hũ" is reserved for genuinely future-uncategorized
 * spend. Percentages sum to 100. No savings/investment/giving jars — those are
 * surplus allocation (Phase 06), not spend.
 *
 * IDs are validated against the current taxonomy so a provisional category set
 * never seeds an unknown id into a jar.
 */

import type { JarConfig } from "./index";
import { CATEGORY_BY_ID } from "./categories";

/** Keep only ids that currently exist as an expense category. */
function expenseOnly(ids: string[]): string[] {
  return ids.filter((id) => CATEGORY_BY_ID[id]?.kind === "expense");
}

export const DEFAULT_JAR_CONFIG: JarConfig = {
  version: 1,
  incomeBasis: "auto",
  jars: [
    {
      id: "essentials",
      label: "Thiết yếu",
      categoryIds: expenseOnly([
        "housing",
        "utilities",
        "subscriptions",
        "insurance",
        "groceries",
        "transport",
        "health",
      ]),
      allocation: { mode: "percent", value: 65 },
    },
    {
      id: "dining",
      label: "Ăn uống",
      categoryIds: expenseOnly(["dining"]),
      allocation: { mode: "percent", value: 15 },
    },
    {
      id: "lifestyle",
      label: "Hưởng thụ",
      categoryIds: expenseOnly(["entertainment", "shopping"]),
      allocation: { mode: "percent", value: 20 },
    },
  ],
};
