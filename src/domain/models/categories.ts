/**
 * Minimal category taxonomy shared by fixtures and the engine.
 *
 * NOTE: Phase 05 (Transactions & budget) will own the full, user-editable
 * taxonomy. For now this is the single source of truth for category IDs and
 * their fixed/discretionary + income/expense flags, so the mock generator and
 * the calculation engine agree on the same string IDs. "Categories are data."
 */

export type CategoryKind = "expense" | "transfer";

export interface CategoryDef {
  id: string;
  label: string;
  kind: CategoryKind;
  /** Fixed = recurring, non-negotiable spend; discretionary otherwise. */
  fixed: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "housing", label: "Nhà ở", kind: "expense", fixed: true },
  { id: "utilities", label: "Tiện ích", kind: "expense", fixed: true },
  { id: "subscriptions", label: "Đăng ký dịch vụ", kind: "expense", fixed: true },
  { id: "insurance", label: "Bảo hiểm", kind: "expense", fixed: true },
  { id: "dining", label: "Ăn uống", kind: "expense", fixed: false },
  { id: "transport", label: "Di chuyển", kind: "expense", fixed: false },
  { id: "shopping", label: "Mua sắm", kind: "expense", fixed: false },
  { id: "groceries", label: "Nhu yếu phẩm", kind: "expense", fixed: false },
  { id: "entertainment", label: "Giải trí", kind: "expense", fixed: false },
  { id: "health", label: "Sức khỏe", kind: "expense", fixed: false },
  { id: "transfer", label: "Chuyển khoản", kind: "transfer", fixed: false },
];

export const CATEGORY_BY_ID: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

/**
 * Sentinel for a transaction the bank shipped WITHOUT an enrichment label — a
 * "missing label" state, NOT a spending category. Deliberately kept OUT of
 * `CATEGORIES`/`CATEGORY_BY_ID` (it belongs to no jar and is never a valid AI
 * suggestion target). The engine surfaces it as its own "Chưa phân loại" bucket
 * instead of silently defaulting to 0 (invariant #6).
 */
export const UNCLASSIFIED = "unclassified" as const;
export const UNCLASSIFIED_LABEL = "Chưa phân loại";

/** True for the unclassified sentinel (not a real taxonomy id). */
export function isUnclassifiedCategory(id: string): boolean {
  return id === UNCLASSIFIED;
}

/**
 * Human label for any category id: taxonomy label, the "Chưa phân loại" label
 * for the sentinel, else the raw id (defensive — an orphaned id still renders).
 */
export function categoryLabel(id: string): string {
  if (id === UNCLASSIFIED) return UNCLASSIFIED_LABEL;
  return CATEGORY_BY_ID[id]?.label ?? id;
}

/** Category IDs flagged as fixed (recurring, non-discretionary) spend. */
export const FIXED_CATEGORY_IDS: ReadonlySet<string> = new Set(
  CATEGORIES.filter((c) => c.fixed).map((c) => c.id),
);

/** Convenience map of well-known IDs for the fixture generator. */
export const CATEGORY = {
  housing: "housing",
  utilities: "utilities",
  subscriptions: "subscriptions",
  insurance: "insurance",
  dining: "dining",
  transport: "transport",
  shopping: "shopping",
  groceries: "groceries",
  entertainment: "entertainment",
  health: "health",
  transfer: "transfer",
} as const;
