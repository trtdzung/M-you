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
  /** Saved payees the assistant may resolve a transfer recipient from (Level 3). */
  listBeneficiaries(): Promise<Beneficiary[]>;
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
   * Read the user's saved spending-jar configuration, or `null` when none is
   * stored (or the stored shape is invalid — the caller then seeds a default).
   * User config, like `getBudgets`; the mock impl is client-local storage, a
   * real adapter maps to the MSB preferences API (invariant #4).
   */
  getJarConfig(): Promise<JarConfig | null>;
  /** Persist the user's spending-jar configuration. First write on `Providers`. */
  saveJarConfig(config: JarConfig): Promise<void>;
}
