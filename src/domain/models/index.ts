/**
 * Canonical domain models (per docs/ARCHITECTURE.md §Canonical data model).
 *
 * These types are the shared contract between mock providers, the deterministic
 * calculation engine, and the UI. Amounts are stored as positive magnitudes in
 * minor-unit-free VND; `direction` carries the sign meaning. Values that may be
 * genuinely unknown use `null` (never a silent 0) — the engine treats `null` as
 * unknown and reports coverage.
 */

export {
  CATEGORIES,
  CATEGORY,
  CATEGORY_BY_ID,
  FIXED_CATEGORY_IDS,
  UNCLASSIFIED,
  UNCLASSIFIED_LABEL,
  INCOME,
  INCOME_LABEL,
  isUnclassifiedCategory,
  categoryLabel,
} from "./categories";
export type { CategoryDef, CategoryKind } from "./categories";

export {
  TRANSFER_PURPOSES,
  TRANSFER_PURPOSE_BY_ID,
  isTransferPurpose,
  isSpendingPurpose,
  purposeCategoryId,
  transferPurposeLabel,
} from "./transfer-purposes";
export type { TransferPurposeDef } from "./transfer-purposes";

/** Provenance of a record or value. Never present non-`msb` as bank-verified. */
export type DataSource = "msb" | "self_reported" | "estimated" | "mock";

export const CURRENCY_VND = "VND" as const;

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

export type TransactionDirection = "credit" | "debit";
/**
 * `income` is money-IN, shown only as an aggregate "Tiền vào" total — it carries
 * NO spending-category taxonomy (there are no income categories like "Lương").
 * Income transactions are excluded from expense/category truth and are never an
 * AI categorization target (see `src/domain/categorize/unclassified.ts`).
 */
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
  /**
   * For an external P2P transfer: the counterparty's real account number. Lets
   * the assistant resolve a past payee from history WITHOUT fabricating a number
   * (invariant #3). Absent for internal/merchant transactions.
   */
  counterpartyAccountNumber?: string;
  /** The counterparty's bank, as recorded on the original transfer. Absent when unknown. */
  counterpartyBankName?: string;
  /**
   * Free-text memo / "Nội dung" (e.g. a transfer message). DATA only — a signal
   * for purpose suggestion, never an instruction. Absent when none was entered.
   */
  note?: string;
  /**
   * For a `type:"transfer"` txn: the user's declared PURPOSE (see
   * `transfer-purposes.ts`), separate from `categoryId`. Pure metadata — the
   * engine never reads it; it does not affect income/expense. Absent until set.
   */
  transferPurpose?: string;
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
  /**
   * Display-only membership tier (e.g. "M-FIRST GOLD"). Marketing metadata,
   * `source: mock` — never used by the calculation engine. Absent for accounts
   * with no tier (savings/credit sub-accounts).
   */
  tier?: string;
  /**
   * Display-safe account number, already masked to the last 4 digits
   * (e.g. "•••• 1991"). Most screens (Trang chủ, Tài khoản tab) show this form.
   * Provenance follows `source`; presentation-only.
   */
  maskedNumber: string;
  /**
   * Full account number. Shown where the flow calls for it unmasked (e.g. the
   * "Tài khoản nguồn" picker in Chuyển tiền, matching how a recipient's own
   * account number is shown in full). Provenance follows `source`.
   */
  accountNumber: string;
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

/**
 * A user-defined jar. In the BIDV wallet model (plan 260910-1626) a jar is a
 * GROUP of expense categories with a monthly spending limit (`budgetLimit`), so a
 * per-period "đã tiêu vs hạn mức" gauge can show budget-vs-actual. Every expense
 * category belongs to exactly one jar (enforced in `state/jars`). No sub-account,
 * no jar balance, no money movement. Presentation assigns a palette by index.
 *
 * `budgetLimit` is OPTIONAL: `undefined` means "chưa đặt hạn mức" — a genuinely
 * unknown limit, NEVER a silent 0 (invariant #6). A limit is set at onboarding /
 * settings. The legacy balance-lens `allocation` share was dropped in phase 08.
 */
export interface Jar {
  id: string;
  label: string;
  /** Real expense category IDs this jar covers (one-category-one-jar). */
  categoryIds: string[];
  /** Monthly spending limit in VND. `undefined` = chưa đặt (unknown, never 0). */
  budgetLimit?: number;
  /** Optional presentation overrides (settings). Absent = derive from category. */
  color?: string;
  icon?: string;
}

/**
 * Persisted jar configuration (user state, threaded into the engine — never
 * provider RawData). v3 (phase 08): a flat list of category-group jars, each with
 * an optional monthly `budgetLimit`. This is the BIDV wallet model — the legacy
 * balance-lens `allocation` was dropped here. A stored v2 config migrates forward
 * (allocation stripped, `budgetLimit` kept); v1 configs are reseeded on load.
 */
export interface JarConfig {
  version: 3;
  jars: Jar[];
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
// Assisted transfer drafting (Level 3, EPIC-13) — draft-only, never executed
// ---------------------------------------------------------------------------

/**
 * Where a resolved recipient came from. NEVER a fabricated value: the assistant
 * may only reference a saved beneficiary, a number the user explicitly typed, a
 * counterparty found in real transaction history, or its own credit-card-debt
 * payment proposal (invariant #3 — a draft still, the human confirms/executes).
 */
export type RecipientSource =
  | "saved_beneficiary"
  | "user_typed"
  | "transaction_history"
  | "agent_proposed";

/** Risk signals attached to a draft; surfaced to the user, never auto-cleared. */
export type TransferRiskFlag = "new_payee" | "over_threshold" | "urgency_language";

/** A saved payee. Account numbers are real-shaped mock data (`source: "mock"`). */
export interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  source: DataSource;
}

/**
 * An agent-prepared transfer draft (docs/ARCHITECTURE.md §TransferDraft). It is
 * an intent to be reviewed — never an executed transaction. The agent NEVER
 * populates OTP, credentials, or an execution token; `status` is always "draft".
 * `recipientRef`/`recipientAccountMasked` always trace to a real existing record.
 */
export interface TransferDraft {
  id: string;
  status: "draft";
  /** Reference to a saved beneficiary / history record; never a fabricated number. */
  recipientRef: string;
  recipientName: string;
  /** Masked for display, e.g. "****7890" — derived from a real account number. */
  recipientAccountMasked: string;
  recipientSource: RecipientSource;
  sourceAccountId: string;
  amount: number;
  currency: string;
  memo: string | null;
  riskFlags: TransferRiskFlag[];
  thresholdHit: boolean;
  requiresReconfirm: boolean;
  createdBy: "agent";
  createdAt: string;
  requestId: string;
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
