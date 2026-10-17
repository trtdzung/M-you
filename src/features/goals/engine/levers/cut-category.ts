import type { Lever } from "../../model/types";

export interface CategoryAverage {
  categoryId: string;
  average: number;
  /** Display name; absent/null when unknown. */
  label?: string | null;
}

/** Cut the biggest spending category; null when there is no category data. */
export function cutCategoryLever(
  requiredMonthly: number,
  surplus: number,
  categoryAverages: CategoryAverage[],
): Extract<Lever, { kind: "cut_category" }> | null {
  if (categoryAverages.length === 0) return null;
  const biggest = categoryAverages.reduce((a, b) => (b.average > a.average ? b : a));
  const cutPerMonth = requiredMonthly - surplus;
  return {
    kind: "cut_category",
    categoryId: biggest.categoryId,
    categoryLabel: biggest.label ?? null,
    cutPerMonth,
    enough: cutPerMonth <= biggest.average,
  };
}
