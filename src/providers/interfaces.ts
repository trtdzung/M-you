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
  JarLedgerInput,
  Liability,
  MockProduct,
  MonthlySnapshot,
  StoredCategory,
  Transaction,
  TransactionQuery,
} from "@/domain/models";
import type { GoalRecord } from "@/domain/models/goal-input";

/**
 * What every category WRITE returns: the persona's whole taxonomy plus its whole
 * jar set. A category write is really two writes server-side (the row and the jar
 * membership), so the aggregate comes back together — the client never has to
 * re-fetch the jars into a race, and can never hold a jar config that claims a
 * category the taxonomy no longer has (which `evaluateJarBudget` would count).
 */
export interface CategoryWriteResult {
  categories: StoredCategory[];
  jarConfig: JarConfig;
}

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
   * config, never `null`. A persona with zero stored rows comes back with an
   * empty `jars` array (see `src/lib/jars-store.ts`'s `readJarConfig`).
   *
   * Every jar and category method REJECTS with an `ApiError` (`./api-error`) on
   * a non-ok response — a failed load is never disguised as an empty config
   * (invariant #6), and a refused write carries the server's reason (e.g. 422
   * over the CASA cap with `overBy`).
   */
  getJarConfig(): Promise<JarConfig>;
  /**
   * Create a new jar with its REQUIRED monthly limit (`jar.budgetLimit`) and
   * opening balance (`balance` ≥ 0 — 0 is a known 0, not "chưa có số dư"). The
   * server writes the jar and its opening ledger row atomically and rejects (422)
   * an opening balance that would raise Σ spendable past CASA (`overBy`).
   * Returns the full updated config.
   */
  createJar(jar: Jar, balance: number): Promise<JarConfig>;
  /**
   * Patch an existing jar's fields (label, limit, colour, icon, categories). A
   * limit is a monthly PLAN, never money: editing it is not CASA-capped.
   * Returns the full updated config.
   */
  updateJar(id: string, patch: Partial<Omit<Jar, "id">>): Promise<JarConfig>;
  /**
   * Deposit into / withdraw from jar balances — ONE atomic batch
   * (`POST /api/jar-ledger`, 1–50 entries, all-or-nothing). A display partition
   * of CASA: no money moves, no OTP (invariant #3). Rejects with an `ApiError`:
   * 404 unknown jar, 422 `jar not persisted`, `over balance` (+ `maxWithdraw`),
   * `over CASA cap` (+ `overBy`). Returns the full updated config (with ledger).
   */
  postJarLedger(entries: JarLedgerInput[]): Promise<JarConfig>;
  /**
   * Remove a jar outright (its categories become "chưa xếp hũ"; the server also deletes every
   * "điều chỉnh hũ" rebalance leg from/to it). Returns the full updated config.
   */
  removeJar(id: string): Promise<JarConfig>;
  /** Move `categoryId` into `jarId`, removing it from every other jar first. Returns the full updated config. */
  assignCategory(categoryId: string, jarId: string): Promise<JarConfig>;
  /** Replace the whole jar set (template apply / reset to default). Returns the full updated config. */
  replaceJars(jars: Jar[]): Promise<JarConfig>;
  /**
   * The persona's category taxonomy in display order (invariant #7 — categories
   * are data, not a bundled constant). `includeArchived` adds the hidden rows,
   * flagged `archived: true`: they are out of every picker but keep their jar
   * membership, so their labels must still resolve for historical transactions
   * (invariant #5). REJECTS on a non-ok response — an empty array would read as
   * "this user has no categories" (invariant #6).
   */
  getCategories(opts?: { includeArchived?: boolean }): Promise<StoredCategory[]>;
  /**
   * Create one user category. `kind` is always `expense` server-side and the id
   * is generated there from the label — a client-supplied id is ignored. With
   * `jarId` the category lands in THAT jar atomically; without it the
   * category is "chưa xếp hũ" (in no jar).
   */
  createCategory(input: { label: string; fixed?: boolean; jarId?: string }): Promise<CategoryWriteResult>;
  /** Rename / re-flag one CUSTOM category (a bundled preset answers 403). */
  updateCategory(id: string, patch: { label?: string; fixed?: boolean }): Promise<CategoryWriteResult>;
  /**
   * Hide (or un-hide) a category. Archiving is the escape hatch for a category
   * still in use: it leaves the pickers but KEEPS its jar membership, so no past
   * month's jar total moves.
   */
  archiveCategory(id: string, archived: boolean): Promise<CategoryWriteResult>;
  /**
   * Hard-delete an UNUSED custom category (stripped from its jar in the same
   * transaction). Rejects with a 409 `ApiError` carrying `usedBy` when records
   * still point at it — the remedy is `archiveCategory`, never a silent rewrite
   * of the user's history (invariants #5, #6).
   */
  deleteCategory(id: string): Promise<CategoryWriteResult>;
  /**
   * Debit a confirmed transfer's amount from an account, mutating its real
   * balance in the store (SQLite `accounts` table — CASA is DB-backed now, not a
   * fixture + localStorage overlay). Reached only from the human-confirmed
   * Chuyển tiền flow (invariant #3); the resulting balance flows back through
   * `listAccounts()`. Idempotency/replay is guarded by the caller (the draft is
   * consumed on confirm), not here.
   *
   * `record` (H14/U1): the transfer's self-reported primary txn. When given, the
   * debit and the txn insert are atomic server-side — a rejection means NOTHING
   * was debited or stored, so the caller must not show success.
   */
  applyAccountDebit(accountId: string, amount: number, record?: Transaction): Promise<void>;
}
