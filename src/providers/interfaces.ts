/**
 * Provider contracts. UI and domain code depend on THESE interfaces, never on
 * mock fixture files (architectural invariant #4). The mock provider is one
 * implementation; real MSB adapters can replace it without touching callers.
 *
 * All methods are async so a real network-backed provider is a drop-in swap.
 */

import type {
  Account,
  Asset,
  Beneficiary,
  Budget,
  Goal,
  Jar,
  JarConfig,
  Liability,
  MockProduct,
  MonthlySnapshot,
  Transaction,
  TransactionQuery,
} from "@/domain/models";
import type { GoalRecord } from "@/domain/models/goal-input";

export interface AccountDataProvider {
  listAccounts(): Promise<Account[]>;
}

export interface TransactionDataProvider {
  listTransactions(query?: TransactionQuery): Promise<Transaction[]>;
}

/**
 * Result of reading a user-authored record collection: the guard-valid records
 * plus how many stored elements the per-record guard dropped (red-team #4). The
 * caller surfaces `dropped` as a non-blocking notice — it never wipes siblings.
 */
export interface UserRecordsResult<T> {
  records: T[];
  dropped: number;
}

export interface AssetDataProvider {
  /** SEED assets only (persona fixtures). User records come via `getUserAssets`. */
  listAssets(): Promise<Asset[]>;
  /** User-authored assets, per-record guarded. Distinct from the seed read (#3). */
  getUserAssets(): Promise<UserRecordsResult<Asset>>;
  /** Persist a new user asset (persistence only; validation is upstream). */
  createAsset(record: Asset): Promise<void>;
  /** Replace an existing user asset by id. */
  updateAsset(record: Asset): Promise<void>;
  /** Remove a user asset by id. */
  deleteAsset(id: string): Promise<void>;
}

export interface LiabilityDataProvider {
  /** SEED liabilities only. User records come via `getUserLiabilities`. */
  listLiabilities(): Promise<Liability[]>;
  /** User-authored liabilities, per-record guarded. Distinct from the seed read. */
  getUserLiabilities(): Promise<UserRecordsResult<Liability>>;
  createLiability(record: Liability): Promise<void>;
  updateLiability(record: Liability): Promise<void>;
  deleteLiability(id: string): Promise<void>;
}

export interface GoalDataProvider {
  /** SEED goals only (persona fixtures). User records come via `getUserGoals`. */
  listGoals(): Promise<Goal[]>;
  /** User-authored goals, per-record guarded. Distinct from the seed read (#3). */
  getUserGoals(): Promise<UserRecordsResult<GoalRecord>>;
  /** Persist a new user goal (persistence only; validation is upstream). */
  createGoal(record: GoalRecord): Promise<void>;
  /** Replace an existing user goal by id. */
  updateGoal(record: GoalRecord): Promise<void>;
  /** Remove a user goal by id. */
  deleteGoal(id: string): Promise<void>;
}

export interface MarketDataProvider {
  /** Net-worth snapshots for the trend line (per month, oldest first). */
  getMonthlySnapshots(): Promise<MonthlySnapshot[]>;
  /** Read-only MSB product catalogue the assistant may reference. */
  listMockProducts(): Promise<MockProduct[]>;
}

export interface BeneficiaryDataProvider {
  /** Saved payees the assistant may resolve a transfer recipient from (Level 3). Backed by `data/pfm.sqlite3` via `/api/beneficiaries`, not a fixture. */
  listBeneficiaries(): Promise<Beneficiary[]>;
  /** Persist a new saved recipient (or update its display name if the account is already saved). Returns the full updated list. */
  createBeneficiary(record: { name: string; accountNumber: string; bankName: string }): Promise<Beneficiary[]>;
}

/**
 * The full provider bundle consumed by the app. Composes every data provider
 * plus budgets and goals, so screens receive a single `Providers` object.
 */
export interface Providers
  extends AccountDataProvider,
    TransactionDataProvider,
    AssetDataProvider,
    LiabilityDataProvider,
    GoalDataProvider,
    MarketDataProvider,
    BeneficiaryDataProvider {
  getBudgets(): Promise<Budget[]>;
  /**
   * Read the user's current spending-jar configuration. Backed by
   * `data/pfm.sqlite3` via `/api/jars` (invariant #4) — always returns a
   * config, never `null`. NOTE: a persona with zero stored rows does not
   * come back with an empty `jars` array — the server's healing step
   * synthesizes a single catch-all "Khác" jar in that case (see
   * `src/lib/jars-store.ts`'s `readJarConfig`).
   */
  getJarConfig(): Promise<JarConfig>;
  /** Create a new jar. Returns the full updated config. */
  createJar(jar: Jar): Promise<JarConfig>;
  /** Patch an existing jar's fields. Returns the full updated config. */
  updateJar(id: string, patch: Partial<Omit<Jar, "id">>): Promise<JarConfig>;
  /**
   * Patch several jars ATOMICALLY in one transaction — used by "Chia ngay" to set
   * every jar's `budgetLimit` in a single write (no `Promise.all` race). The
   * server enforces `fitsCasaCap` on the resulting set and rejects (422) if Σ
   * budgetLimit would exceed CASA. Returns the full updated config.
   */
  updateJars(patches: Record<string, Partial<Omit<Jar, "id">>>): Promise<JarConfig>;
  /** Remove a jar (its categories move to "Khác"). Returns the full updated config. */
  removeJar(id: string): Promise<JarConfig>;
  /** Move `categoryId` into `jarId`, removing it from every other jar first. Returns the full updated config. */
  assignCategory(categoryId: string, jarId: string): Promise<JarConfig>;
  /** Replace the whole jar set (template apply / reset to default). Returns the full updated config. */
  replaceJars(jars: Jar[]): Promise<JarConfig>;
  /**
   * Debit a confirmed transfer's amount from an account, mutating its real
   * balance in the store (SQLite `accounts` table — CASA is DB-backed now, not a
   * fixture + localStorage overlay). Reached only from the human-confirmed
   * Chuyển tiền flow (invariant #3); the resulting balance flows back through
   * `listAccounts()`. Idempotency/replay is guarded by the caller (the draft is
   * consumed on confirm), not here.
   */
  applyAccountDebit(accountId: string, amount: number): Promise<void>;
}
