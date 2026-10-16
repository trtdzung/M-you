/**
 * Canonical domain models (per docs/ARCHITECTURE.md §Canonical data model).
 *
 * These types are the shared contract between mock providers, the deterministic
 * calculation engine, and the UI. Amounts are stored as positive magnitudes in
 * minor-unit-free VND; `direction` carries the sign meaning. Values that may be
 * genuinely unknown use `null` (never a silent 0) — the engine treats `null` as
 * unknown and reports coverage.
 */

export { CATEGORIES, CATEGORY, CATEGORY_BY_ID, FIXED_CATEGORY_IDS } from "./categories";
export type { CategoryDef, CategoryKind } from "./categories";

/** Provenance of a record or value. Never present non-`msb` as bank-verified. */
export type DataSource = "msb" | "self_reported" | "estimated" | "mock";

export const CURRENCY_VND = "VND" as const;

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

export type TransactionDirection = "credit" | "debit";
export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "refund"
  | "fee"
  | "card_payment";
export type TransactionStatus = "pending" | "posted" | "refunded" | "reversed";

export interface Transaction {
  id: string;
  accountId: string;
  /** ISO 8601 timestamp of when the transaction posted (or is expected to). */
  postedAt: string;
  /** Positive magnitude in VND. Sign meaning comes from `direction`. */
  amount: number;
  currency: string;
  direction: TransactionDirection;
  type: TransactionType;
  merchantName: string;
  merchantNormalizedName: string;
  categoryId: string;
  status: TransactionStatus;
  source: DataSource;
  isRecurring: boolean;
  userEdited: boolean;
  /** For refunds/reversals: the original transaction they act on. */
  relatedTransactionId?: string;
  /** Both legs of an internal transfer share this id (for exclusion). */
  transferGroupId?: string;
}

export interface TransactionQuery {
  /** ISO date (inclusive). */
  from?: string;
  /** ISO date (inclusive). */
  to?: string;
  accountId?: string;
  categoryId?: string;
  status?: TransactionStatus;
  type?: TransactionType;
  /** Free-text match against merchant name. */
  search?: string;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export type AccountType = "current" | "savings" | "credit_card";

export interface Account {
  id: string;
  type: AccountType;
  institution: string;
  currency: string;
  balance: number;
  availableBalance: number;
  lastSyncedAt: string;
  source: DataSource;
}

// ---------------------------------------------------------------------------
// Asset & Liability
// ---------------------------------------------------------------------------

export type AssetType =
  | "cash"
  | "deposit"
  | "fund"
  | "stock"
  | "gold"
  | "real_estate"
  | "vehicle"
  | "other";

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  /** `null` = value genuinely unknown; the engine keeps it unknown. */
  value: number | null;
  currency: string;
  source: DataSource;
  lastUpdatedAt: string;
  isEstimated: boolean;
}

export type LiabilityType =
  | "credit_card"
  | "personal_loan"
  | "mortgage"
  | "instalment"
  | "other";

export interface Liability {
  id: string;
  type: LiabilityType;
  name: string;
  outstandingPrincipal: number | null;
  interestRate: number | null;
  minimumPayment: number | null;
  /** ISO date of next payment due, or `null` if unknown. */
  dueDate: string | null;
  /** Remaining term in months, or `null` if unknown. */
  remainingTerm: number | null;
  source: DataSource;
  lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// Budget, Goal, snapshot, product
// ---------------------------------------------------------------------------

export interface Budget {
  categoryId: string;
  /** Monthly limit in VND. */
  limit: number;
  period: "monthly";
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  source: DataSource;
}

/** Aggregated net-worth point used to draw a trend (per month). */
export interface MonthlySnapshot {
  /** "YYYY-MM". */
  month: string;
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorth: number;
  source: DataSource;
}

/** Read-only MSB product surface the assistant may reference (never sells). */
export interface MockProduct {
  id: string;
  name: string;
  type: "savings" | "deposit" | "card" | "loan" | "fund";
  summary: string;
  indicativeRate?: number;
}

// ---------------------------------------------------------------------------
// Insight (canonical shape; detectors live in src/insights — Phase 07)
// ---------------------------------------------------------------------------

export type InsightSeverity = "info" | "attention" | "urgent";

export interface InsightFact {
  label: string;
  value: number | string;
  period?: string;
  txnIds?: string[];
}

export interface Insight {
  id: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  explanation: string;
  sourceFacts: InsightFact[];
  comparisonPeriod?: string;
  generatedAt: string;
  confidence: number;
  assumptions: string[];
  actionType?: string;
  status: "new" | "seen" | "dismissed" | "snoozed" | "helpful";
}
