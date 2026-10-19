/** Wrapped tunables — principled values, named once (no magic numbers in builders). */

/** The window is always this many VN months, ending at the last completed month. */
export const WRAPPED_MONTHS = 6 as const;

/** Minimum months WITH expense data for a deck at all. */
export const MIN_MONTHS = 3;
/** Minimum counted expense rows (positive contribution) in the window. */
export const MIN_EXPENSE_TXNS = 20;

/** Merchants ranked on the top-merchants slide. */
export const TOP_MERCHANTS = 3;
/** Max length of any text fact (including the ellipsis). */
export const LABEL_MAX = 40;

/** A recurring series' amounts may vary at most this fraction of their mean unless its category is fixed. */
export const RECURRING_AMOUNT_SPREAD = 0.1;
/** Recurring items listed on the slide; the total still covers every qualifying series. */
export const RECURRING_MAX_ITEMS = 5;

// Archetype rules. Shares are PERCENT on the 0-100 scale (like every `pct` fact), not
// 0..1. Set on principle, never tuned to the seeded personas (reachability is proven
// with synthetic fixtures).
/** Weekend share of spend at/above which a user is a "weekend-explorer" (a flat week is 2/7 = ~29 %). */
export const WEEKEND_EXPLORER_MIN = 40;
/** Fixed-category share of spend at/above which a user is a "steady-planner". */
export const STEADY_PLANNER_FIXED_MIN = 50;
/** Known signals (of 4) needed for ANY archetype, including the "balanced" fallback. */
export const ARCHETYPE_MIN_SIGNALS = 3;
