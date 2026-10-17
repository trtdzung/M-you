/**
 * Pure financial composition — the single place provider data + the deterministic
 * engine are combined for a selected month. Extracted from the React hook so the
 * exact same numbers can be computed server-side (AI facade) without React.
 *
 * No React, no providers, no I/O: raw data in, `Financials` out. The client hook
 * (`useFinancials`) wraps this with state; the server AI context reuses it.
 */

import type {
  Account,
  Asset,
  Budget,
  Goal,
  JarConfig,
  Liability,
  MockProduct,
  MonthlySnapshot,
  StoredCategory,
  Transaction,
} from "@/domain/models";
import {
  aggregateCashflow,
  calculateNetWorth,
  casaBalanceOrUnknown,
  cashRunwayMonths,
  computeUnallocatedPool,
  dateToMonthKey,
  detectRecurring,
  estimateEndOfMonth,
  evaluateBudget,
  evaluateJarBudget,
  evaluateJarEnvelope,
  financialHealth,
  jarSpendable,
  monthPeriodFromKey,
  networthTrend,
  rebalanceNetByJar,
  rebalanceTxns,
  selectUnlabeledSpend,
  spendingByCategory,
  upcomingObligations,
  type BudgetLine,
  type CashflowResult,
  type CashRunway,
  type CategorySpend,
  type EndOfMonthEstimate,
  type FinancialHealth,
  type JarBudgetResult,
  type JarEnvelopeResult,
  type NetWorthResult,
  type NetWorthTrendMeta,
  type Obligation,
  type RecurringSeries,
  type UnallocatedPoolResult,
  type UnlabeledSpend,
} from "./index";
import { DEMO_NOW, prevMonthKey } from "@/lib/demo-clock";

/** Everything a provider bundle yields for one persona (loaded once). */
export interface RawData {
  transactions: Transaction[];
  accounts: Account[];
  assets: Asset[];
  liabilities: Liability[];
  budgets: Budget[];
  snapshots: MonthlySnapshot[];
  goals: Goal[];
  products: MockProduct[];
}

/** Derived financial figures for a single month — the app's shared truth. */
export interface Financials {
  monthKey: string;
  cashflow: CashflowResult;
  prevCashflow: CashflowResult;
  networth: NetWorthResult;
  budgetLines: BudgetLine[];
  categorySpend: CategorySpend[];
  recurring: RecurringSeries[];
  obligations: Obligation[];
  /** Projected liquid cash at month end (Red Team C2 — current month only). */
  endOfMonth: EndOfMonthEstimate;
  /** Months of liquid cash at the current burn rate. */
  runway: CashRunway;
  /**
   * Net-worth delta inputs (Red Team C3 — raw values for `DeltaBadge`, never a
   * reinvented delta object) + sparkline series. Null when no snapshot exists.
   */
  networthCurrent: number | null;
  networthPrevious: number | null;
  networthSeries: number[];
  /** Lowest-trust provenance over the exact snapshots feeding the series (H2). */
  networthSeriesMeta: NetWorthTrendMeta;
  /**
   * Per-jar budget (BIDV wallet model, plan 260910-1626): đã tiêu vs hạn mức for
   * the selected period, with MoM + a total gauge. This is the source of truth for
   * the Ngân sách tab + the overview donut grouping — screens read THIS, never
   * recompute jar spend (invariant #2). Unset limits stay unknown (never 0).
   */
  jarBudget: JarBudgetResult;
  /**
   * Envelope view for the Tổng quan "hũ" widget: "chờ phân bổ" (số dư CASA chưa
   * earmark) + per-jar funded "còn lại trong hũ" (= đã phân bổ từ CASA − đã tiêu
   * kỳ này). DERIVED from `jarBudget` spend + the CASA account balances, with
   * inter-jar rebalance coverage (`categoryId: REBALANCE_CATEGORY` txns) folded into
   * each jar's `remaining` — a jar carries no stored balance (invariant #1, RT-1/2).
   */
  jarEnvelope: JarEnvelopeResult;
  /**
   * The virtual "Chưa phân bổ" pool = casaBalance(current) − Σ jar spendable
   * (`max(0, remaining)`, the SAME number the overview + picker show). Derived
   * (never stored), so every screen showing jar totals / CASA reads one truth —
   * including `overAllocated` ("Vượt phân bổ"), which must surface on every such
   * surface, not just the transfer sheet (Red Team #13). Negative `amount` is
   * kept as-is (invariant #6); the UI presents available as 0. `amount` is
   * "unknown" when the persona has no `current` account (D27).
   */
  unallocatedPool: UnallocatedPoolResult;
  /**
   * The period's inter-jar rebalance txns (`categoryId: REBALANCE_CATEGORY`, posted,
   * in-period) — the same tagged txns already folded into every jar's `remaining`.
   * Surfaced so the jar-detail view (Phase 02) and the write-path/undo surfaces
   * (Phase 04/05) can render the "cho/nhận" pseudo-lines without re-scanning the txn
   * array. Excluded from spend/thu/chi (invariant #6); each carries `origin` (#5).
   */
  jarRebalances: Transaction[];
  /**
   * Current-month expenses spent straight from CASA that never got a category
   * ("Chưa gắn nhãn"). Posted-only, in-period (`selectUnlabeledSpend`). The
   * overview card reads `count`/`amount`; the labeling sheet re-runs the SAME
   * selector for the list (parity by construction).
   *
   * CLIENT-ONLY: corrections live in localStorage, so only the client hook feeds
   * correction-applied txns here. The server/AI-facade path sees RAW txns and
   * would over-count already-labeled ones — do NOT wire an AI tool to this field
   * until corrections have a server representation.
   */
  unlabeled: UnlabeledSpend;
  /**
   * Financial-health indicators (runway, surplus, essential coverage, asset
   * concentration). Composed ONCE here so Tổng quan + Kế hoạch read one object
   * (DRY) — no screen recomputes health locally. Missing inputs stay `null`.
   */
  health: FinancialHealth;
  /**
   * Seed (provider) goals + user-authored goals — the single merged goal view
   * (Phase 05). Kế hoạch (goal list, surplus what-if) reads THIS so a create/
   * edit/delete recomputes live and nothing is double-counted (the provider's
   * `listGoals()` stays seed-only, red-team #2/#3).
   */
  goals: Goal[];
  /**
   * id → label over the PERSONA'S stored taxonomy, the map this composition ran
   * with. Exposed so every downstream presenter (insight detectors, charts) names
   * a category exactly as the numbers above were labelled — one map, no second
   * lookup that could disagree. Empty when the caller supplied no taxonomy; then
   * `categoryLabel`'s built-in fallback still names the ten presets.
   */
  categoryLabels: ReadonlyMap<string, string>;
}

export interface ComposeOptions {
  /** Reference "now" (defaults to the demo clock). */
  now?: Date;
  /**
   * Transactions to compute from — defaults to `raw.transactions`. The client
   * hook passes correction-applied transactions here; the server passes none.
   */
  transactions?: Transaction[];
  /**
   * User jar configuration (Phase 02 supplies the provider-backed value). Absent
   * → no jars are evaluated and `jarLines` is empty. Kept out of `RawData` so the
   * compose stays pure and testable (config is user state, not provider data).
   */
  jarConfig?: JarConfig;
  /**
   * User-authored assets/liabilities (Phase 03), threaded like `jarConfig` — they
   * are context state merged with the seed here, NOT folded into the provider's
   * `listAssets()`/`listLiabilities()` (which stay seed-only). This is the single
   * source of truth for user records; keeping them separate avoids double-counting
   * net worth (red-team #3) and lets a mutation recompute live (red-team #2).
   */
  userAssets?: Asset[];
  userLiabilities?: Liability[];
  /**
   * User-authored goals (Phase 05), threaded like `userAssets` — context state
   * merged with the seed goals here, NOT folded into the provider's `listGoals()`
   * (which stays seed-only). Single source of truth; a mutation recomputes live
   * (red-team #2) with no double-count (red-team #3).
   */
  userGoals?: Goal[];
  /**
   * The persona's STORED category taxonomy (`useCategories().categories`, archived
   * included so a historical label still resolves). Categories are data, not a
   * bundled constant (invariant #7), and this is the single seam through which
   * they reach the engine — `src/domain` stays pure, with no hook, fetch or
   * `server-only` import.
   *
   * It drives exactly two things, both derived here so there is one definition:
   *  - `labels` — presentation. Absent ⇒ `categoryLabel` falls back to the built-in
   *    preset map, then to the raw id. Never affects an amount.
   *  - `fixedCategoryIds` — the fixed/discretionary split of `expense`. Absent ⇒
   *    nothing is flagged fixed (`fixed: 0`, `discretionary: expense`). That is a
   *    truthful reading of an empty taxonomy, but it is NOT what a real persona
   *    looks like: every client path must pass this (`useFinancials` does), and a
   *    test that asserts the split must pass it too.
   * `income`, `expense`, `net` and every jar/budget number are identical with or
   * without it.
   */
  categories?: StoredCategory[];
}

/**
 * Compose derived financials for `month` ("YYYY-MM") from raw provider data.
 * Deterministic: identical inputs always yield identical output.
 */
export function computeFinancials(
  raw: RawData,
  month: string,
  options: ComposeOptions = {},
): Financials {
  const now = options.now ?? DEMO_NOW;
  const txns = options.transactions ?? raw.transactions;
  // Seed (provider) records + user-authored records — the single merged view the
  // engine sees. The provider reads stay seed-only, so nothing is double-counted.
  const assets = [...raw.assets, ...(options.userAssets ?? [])];
  const liabilities = [...raw.liabilities, ...(options.userLiabilities ?? [])];
  const period = monthPeriodFromKey(month);
  const prevPeriod = monthPeriodFromKey(prevMonthKey(month));
  const recurring = detectRecurring(txns);
  // The two views of the stored taxonomy the engine needs, derived once (DRY).
  const taxonomy = options.categories ?? [];
  const labels: ReadonlyMap<string, string> = new Map(taxonomy.map((c) => [c.id, c.label]));
  const fixedCategoryIds: ReadonlySet<string> = new Set(
    taxonomy.filter((c) => c.fixed).map((c) => c.id),
  );
  const cashflow = aggregateCashflow(txns, period, fixedCategoryIds);
  const obligations = upcomingObligations(recurring, liabilities, { now, horizonDays: 30 });
  const trend = networthTrend(raw.snapshots);

  // The end-of-month projection is only meaningful when the displayed month IS
  // the current month — its `now`-anchored obligations and run-rate proration
  // assume `now` falls inside `month` (Red Team C2). For any other month the
  // value is genuinely unknown rather than a misleading number. This guards
  // every caller (incl. the future AI facade), not just the Overview wiring.
  const isCurrentMonth = month === dateToMonthKey(now);
  const endOfMonth: EndOfMonthEstimate = isCurrentMonth
    ? estimateEndOfMonth(raw.accounts, cashflow, obligations, now)
    : { value: "unknown", meta: { source: "estimated", freshness: cashflow.meta.freshness } };

  const jarConfig: JarConfig = options.jarConfig ?? { version: 3, jars: [] };

  // Net worth is composed once and reused for `health` (DRY) so the concentration
  // indicator sees the exact same breakdown as the headline. Uses the merged
  // seed + user records (user assets/liabilities are context state, red-team #3).
  const networth = calculateNetWorth(assets, liabilities);

  // Inter-jar rebalance net (Σ nhận − Σ cho) from the REBALANCE_CATEGORY-tagged
  // txns already merged into `txns` — folded into both engines' `remaining` so every
  // derived screen (overview, picker, pool) reflects a rebalance the instant it
  // exists (Phase 03). `spent`/thu/chi stay untouched (excluded in netExpenseByCategory).
  const rebalanceNet = rebalanceNetByJar(txns, period);

  // Jar budget first — the envelope reuses its per-jar net expense as "đã tiêu
  // kỳ này" (DRY, invariant #2) instead of re-deriving spend.
  const jarBudget = evaluateJarBudget(jarConfig, txns, period, prevPeriod, now, rebalanceNet);
  const spentByJar = new Map(jarBudget.lines.map((l) => [l.huId, l.spent]));
  const jarEnvelope = evaluateJarEnvelope(jarConfig, raw.accounts, spentByJar, period, rebalanceNet);
  // Unallocated pool: CASA (current-only, via the shared selector so it never
  // swallows savings/credit — RT#9) minus what jars actually claim (Σ derived
  // spendable = Σ max(0, remaining), the same jarBudget.lines the overview +
  // picker read). Derived here once so every screen reads the same
  // `overAllocated` (RT#13).
  // No `current` account → "unknown" (D27), never a fabricated 0 → negative pool.
  // Same formula as `jarEnvelope.pending` (one definition, D26).
  const spendableTotal = jarBudget.lines.reduce((sum, l) => sum + (jarSpendable(l.remaining) ?? 0), 0);
  const unallocatedPool = computeUnallocatedPool({
    casaBalance: casaBalanceOrUnknown(raw.accounts),
    spendableTotal,
  });

  // Current-month unlabeled spend — count/amount only; the sheet re-runs the
  // same selector for `items` (parity, client-only per the `unlabeled` doc).
  const unlabeled = selectUnlabeledSpend(txns, period);

  return {
    monthKey: month,
    cashflow,
    prevCashflow: aggregateCashflow(txns, prevPeriod, fixedCategoryIds),
    networth,
    budgetLines: evaluateBudget(raw.budgets, txns, period, now, labels),
    categorySpend: spendingByCategory(txns, period, undefined, labels),
    recurring,
    obligations,
    endOfMonth,
    runway: cashRunwayMonths(raw.accounts, cashflow.expense),
    networthCurrent: trend.current,
    networthPrevious: trend.previous,
    networthSeries: trend.series,
    networthSeriesMeta: trend.meta,
    jarBudget,
    jarEnvelope,
    unallocatedPool,
    jarRebalances: rebalanceTxns(txns, period),
    unlabeled: { count: unlabeled.count, amount: unlabeled.amount, source: unlabeled.source },
    health: financialHealth(cashflow, raw.accounts, networth),
    goals: [...raw.goals, ...(options.userGoals ?? [])],
    categoryLabels: labels,
  };
}
