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

export interface AccountDataProvider {
  listAccounts(): Promise<Account[]>;
}

export interface TransactionDataProvider {
  listTransactions(query?: TransactionQuery): Promise<Transaction[]>;
}

export interface AssetDataProvider {
  listAssets(): Promise<Asset[]>;
}

export interface LiabilityDataProvider {
  listLiabilities(): Promise<Liability[]>;
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
    MarketDataProvider,
    BeneficiaryDataProvider {
  getBudgets(): Promise<Budget[]>;
  listGoals(): Promise<Goal[]>;
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
