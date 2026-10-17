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

/**
 * A category as the taxonomy API returns it (`GET /api/categories`): the
 * `CategoryDef` shape every reader already knows, plus `archived` — present ONLY
 * on an archived row, so an active category serialises byte-for-byte as it did
 * before the table became writable.
 *
 * It lives HERE rather than next to the store because it is the wire contract
 * shared by the provider interfaces and the client taxonomy state, and
 * `src/lib/categories-store.ts` is `server-only` — neither of them can import it.
 */
export interface StoredCategory extends CategoryDef {
  archived?: true;
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

/**
 * Sentinel carried by money-IN (`type:"income"`) transactions. Like UNCLASSIFIED
 * it is deliberately OUT of `CATEGORIES`/`CATEGORY_BY_ID`: money-in is shown only
 * as a "Tiền vào" aggregate — there are NO income categories, it belongs to no
 * jar, and it is never an AI suggestion target. It exists so income never reuses
 * the UNCLASSIFIED "unenriched expense" bucket.
 */
export const INCOME = "income" as const;
const INCOME_LABEL = "Tiền vào";

/**
 * System category tagging an inter-jar REBALANCE transaction (plan 260918-1120,
 * Phase 03). A rebalance is ONE `Transaction` with this `categoryId` carrying
 * `rebalance` meta `{ fromJarId, toJarId, triggerTxnId, origin }`; the engine reads
 * the meta to move `−amount` off the donor jar's balance and `+amount` onto the
 * target jar's balance. Like `UNCLASSIFIED`/`INCOME` it is deliberately kept OUT
 * of `CATEGORIES`/`CATEGORY_BY_ID`: it belongs to no jar and is never an AI
 * suggestion target. It is EXCLUDED from thu/chi + spend-by-category exactly like a
 * `type:"transfer"` txn (see `netExpenseByCategory`), so a rebalance never inflates
 * spend for the very envelope it protects (invariants #5/#6).
 */
export const REBALANCE_CATEGORY = "dieu-chinh-hu" as const;
export const REBALANCE_CATEGORY_LABEL = "Điều chỉnh hũ";

/** True for the inter-jar rebalance system category (not a real spend category). */
export function isRebalanceCategory(id: string): boolean {
  return id === REBALANCE_CATEGORY;
}

/**
 * Human label for any category id. Resolution order, deliberately defensive:
 *   1. the sentinels ("Chưa phân loại" / "Tiền vào" / "Điều chỉnh hũ") — system
 *      concepts a stored taxonomy never owns, so they always win;
 *   2. `labels` — the PERSONA'S stored taxonomy (`useCategories().labels`), which
 *      is the only place a custom category's label exists, and also where a
 *      RENAMED preset's current label lives;
 *   3. the bundled preset map — so an un-threaded call site still renders the ten
 *      built-ins correctly instead of regressing to raw ids;
 *   4. the raw id.
 *
 * Every call site should still pass the map. The fallback chain exists so a
 * missing map costs an ugly-but-honest label, never a wrong NUMBER and never a
 * throw (invariants #5/#6).
 */
export function categoryLabel(id: string, labels?: ReadonlyMap<string, string>): string {
  if (id === UNCLASSIFIED) return UNCLASSIFIED_LABEL;
  if (id === INCOME) return INCOME_LABEL;
  if (id === REBALANCE_CATEGORY) return REBALANCE_CATEGORY_LABEL;
  return labels?.get(id) ?? CATEGORY_BY_ID[id]?.label ?? id;
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
