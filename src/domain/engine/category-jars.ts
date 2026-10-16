/**
 * Category → jar grouping for the Dòng tiền charts (Phase 03). A pure re-present
 * of data the engine already produces: it folds `spendingByCategory` into the
 * user's jars (a jar covers one or more categories) so a donut / bar can show
 * "where the period's spend went, by jar". It never recomputes net expense and
 * never touches the balance partition (`jars.ts`) — the hard identity there
 * (Σ jar + residual ≡ balance) is untouched (invariant #2).
 *
 * Invariants honoured here:
 *  - Every expense category belongs to exactly one jar. Config is already
 *    deduped one-category-one-jar (`state/jars` load + mutations), but this map
 *    is first-wins as a defensive second gate so a category can never be
 *    double-counted across two groups.
 *  - Total is conserved: `Σ group.amount === Σ spendingByCategory.amount` — a
 *    category mapped to no jar flows to the catch-all "Khác" group, so the chart
 *    is always exactly 100% of the period's spend (never a silent drop).
 *  - Chips are spend-independent (red-team #11): `jarChipList` is derived from the
 *    full config (every configured jar, plus "Khác" only when some expense
 *    category is unmapped), so a jar with zero spend still shows a chip that
 *    filters to an empty state — it never vanishes with the period's data.
 */

import type { JarConfig, Transaction } from "@/domain/models";
import { CATEGORIES, UNCLASSIFIED, UNCLASSIFIED_LABEL } from "@/domain/models";
import { spendingByCategory, type CategorySpend } from "./category";
import type { Period } from "./types";

/** Catch-all group id/label for expense categories in no jar (orphans). */
export const KHAC_JAR_ID = "khac";
export const KHAC_JAR_LABEL = "Khác";

/**
 * Dedicated group for un-enriched spend (the `UNCLASSIFIED` sentinel). Kept
 * SEPARATE from "Khác" so unlabelled money never silently mixes into a real
 * catch-all jar — it stays visible as "cần gắn nhãn" (invariant #6). Pinned
 * after "Khác" in the ordering below.
 */
export const UNCLASSIFIED_JAR_ID = UNCLASSIFIED;
export const UNCLASSIFIED_JAR_LABEL = UNCLASSIFIED_LABEL;

/** One jar's slice of the period's spend, with its categories broken out. */
export interface JarSpendGroup {
  jarId: string;
  label: string;
  /** Net expense over this jar's categories for the period (whole VND). */
  amount: number;
  /** Share of total period expense in [0, 1]. */
  share: number;
  /** The categories that fed this group, amount-desc. */
  categories: CategorySpend[];
}

/** A filter chip — one per configured jar (+ "Khác" when orphans exist). */
export interface JarChip {
  jarId: string;
  label: string;
}

/**
 * Map every category id to the id of the jar that claims it (first-wins). A
 * category listed by two jars stays with the first — never counted twice.
 */
export function categoryToJarMap(config: JarConfig): Map<string, string> {
  const map = new Map<string, string>();
  for (const jar of config.jars) {
    for (const categoryId of jar.categoryIds) {
      if (!map.has(categoryId)) map.set(categoryId, jar.id);
    }
  }
  return map;
}

/** Category ids listed by more than one jar (for a JarSetup warning). */
export function duplicateCategoryIds(config: JarConfig): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const jar of config.jars) {
    for (const categoryId of jar.categoryIds) {
      if (seen.has(categoryId)) dupes.add(categoryId);
      else seen.add(categoryId);
    }
  }
  return Array.from(dupes);
}

/** Every expense category id in the taxonomy (chip-coverage source of truth). */
export const EXPENSE_CATEGORY_IDS: readonly string[] = CATEGORIES.filter(
  (c) => c.kind === "expense",
).map((c) => c.id);

/**
 * Expense category ids that no jar in `config` claims — the "orphans" the exactly-
 * one invariant heals into the "Khác" jar on load (`state/jars`). Pure and
 * order-stable (taxonomy order) so the heal + any validator agree. Empty when the
 * config already covers every expense category (every template does).
 */
export function orphanExpenseCategoryIds(config: JarConfig): string[] {
  const mapped = categoryToJarMap(config);
  return EXPENSE_CATEGORY_IDS.filter((id) => !mapped.has(id));
}

/**
 * The filter chips for Dòng tiền: one per configured jar (in config order), plus
 * a trailing "Khác" chip ONLY when some expense category is mapped to no jar.
 * Spend-independent by construction — a jar with zero spend this period keeps its
 * chip (selecting it yields an empty state, red-team #11). "Tất cả" is a UI
 * concern the view prepends; it is not part of this list.
 */
export function jarChipList(config: JarConfig): JarChip[] {
  const chips: JarChip[] = config.jars.map((jar) => ({ jarId: jar.id, label: jar.label }));
  const mapped = categoryToJarMap(config);
  const hasOrphan = EXPENSE_CATEGORY_IDS.some((id) => !mapped.has(id));
  if (hasOrphan) chips.push({ jarId: KHAC_JAR_ID, label: KHAC_JAR_LABEL });
  return chips;
}

const labelByJarId = (config: JarConfig): Map<string, string> =>
  new Map(config.jars.map((j) => [j.id, j.label]));

/**
 * Group the period's spend by jar. Runs `spendingByCategory` (so refunds,
 * transfers, reversed and pending are already handled the one canonical way),
 * then folds each category into its jar via `categoryToJarMap`; unmapped
 * categories collect in "Khác". Groups are amount-desc with "Khác" always last,
 * and zero-amount groups are dropped from the chart data (chips come from
 * `jarChipList`, not from here). `share` is each group's fraction of the period
 * total; an empty period yields `[]` (never a NaN share).
 */
export function groupSpendingByJar(
  config: JarConfig,
  txns: Transaction[],
  period: Period,
): JarSpendGroup[] {
  const spends = spendingByCategory(txns, period);
  const total = spends.reduce((s, c) => s + c.amount, 0);
  const catToJar = categoryToJarMap(config);
  const jarLabels = labelByJarId(config);

  // Accumulate categories under their jar id. Unclassified spend goes to its own
  // group (never "Khác"); other unmapped expense categories → "Khác".
  const byJar = new Map<string, CategorySpend[]>();
  for (const spend of spends) {
    const jarId =
      spend.categoryId === UNCLASSIFIED
        ? UNCLASSIFIED_JAR_ID
        : catToJar.get(spend.categoryId) ?? KHAC_JAR_ID;
    const bucket = byJar.get(jarId);
    if (bucket) bucket.push(spend);
    else byJar.set(jarId, [spend]);
  }

  const groupLabel = (jarId: string): string => {
    if (jarId === KHAC_JAR_ID) return KHAC_JAR_LABEL;
    if (jarId === UNCLASSIFIED_JAR_ID) return UNCLASSIFIED_JAR_LABEL;
    return jarLabels.get(jarId) ?? jarId;
  };

  const groups: JarSpendGroup[] = Array.from(byJar.entries()).map(([jarId, categories]) => {
    const amount = categories.reduce((s, c) => s + c.amount, 0);
    return {
      jarId,
      label: groupLabel(jarId),
      amount,
      share: total > 0 ? amount / total : 0,
      categories: [...categories].sort((a, b) => b.amount - a.amount),
    };
  });

  // Amount-desc, but "Khác" then "Chưa phân loại" are always pinned last.
  const pinRank = (jarId: string): number =>
    jarId === UNCLASSIFIED_JAR_ID ? 2 : jarId === KHAC_JAR_ID ? 1 : 0;
  groups.sort((a, b) => {
    const ra = pinRank(a.jarId);
    const rb = pinRank(b.jarId);
    if (ra !== rb) return ra - rb;
    return b.amount - a.amount;
  });

  return groups;
}
