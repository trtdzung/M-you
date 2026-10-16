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
  Budget,
  Goal,
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

/**
 * The full provider bundle consumed by the app. Composes every data provider
 * plus budgets and goals, so screens receive a single `Providers` object.
 */
export interface Providers
  extends AccountDataProvider,
    TransactionDataProvider,
    AssetDataProvider,
    LiabilityDataProvider,
    MarketDataProvider {
  getBudgets(): Promise<Budget[]>;
  listGoals(): Promise<Goal[]>;
}
