import "server-only";

/**
 * Read/write access to the `accounts` table (see `data/schema.md`). Server only
 * — imported by the route handlers under `src/app/api/accounts/`, never by
 * client code (architectural invariant #4).
 *
 * The accounts are the CASA source of truth: a confirmed transfer DEBITS the
 * row's `balance` + `available_balance` directly (mock core-banking), so the
 * money leaves for real and persists across reloads/devices. Rows are seeded
 * per persona from the same canonical builder the transaction fixtures use
 * (`buildPersonaAccounts`), lazily on first read of a persona that has none —
 * so a fresh/unseeded DB still works (mirrors how `jars` self-heal).
 */

import type { Account, Transaction } from "@/domain/models";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { buildPersonaAccounts } from "@/providers/mock/fixtures/generate";
import { getDb } from "./db";
import { upsertManualTxn } from "./manual-txns-store";

interface AccountRow {
  cif: string;
  id: string;
  type: string;
  institution: string;
  currency: string;
  balance: number;
  available_balance: number;
  last_synced_at: string;
  source: string;
  tier: string | null;
  masked_number: string;
  account_number: string;
  sort_order: number;
}

/** Row → domain account. A NULL `tier` stays absent (never an empty string). */
function toAccount(row: AccountRow): Account {
  const account: Account = {
    id: row.id,
    type: row.type as Account["type"],
    institution: row.institution,
    currency: row.currency,
    balance: row.balance,
    availableBalance: row.available_balance,
    lastSyncedAt: row.last_synced_at,
    source: row.source as Account["source"],
    maskedNumber: row.masked_number,
    accountNumber: row.account_number,
  };
  if (row.tier !== null) account.tier = row.tier;
  return account;
}

/**
 * Seed a persona's accounts if the table has none for that `cif`. Idempotent
 * (`INSERT OR IGNORE` + a pre-count) so two concurrent first-reads can't
 * double-insert. An unknown `cif` (no persona) is a no-op → caller gets `[]`.
 */
function seedIfEmpty(cif: string): void {
  const db = getDb();
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE cif = ?").get(cif) as { n: number };
  if (n > 0) return;
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO accounts
       (cif, id, type, institution, currency, balance, available_balance, last_synced_at, source, tier, masked_number, account_number, sort_order)
     VALUES (@cif, @id, @type, @institution, @currency, @balance, @availableBalance, @lastSyncedAt, @source, @tier, @maskedNumber, @accountNumber, @sortOrder)`,
  );
  const seed = db.transaction((accounts: Account[]) => {
    accounts.forEach((account, index) => {
      insert.run({
        cif,
        id: account.id,
        type: account.type,
        institution: account.institution,
        currency: account.currency,
        balance: account.balance,
        availableBalance: account.availableBalance,
        lastSyncedAt: account.lastSyncedAt,
        source: account.source,
        tier: account.tier ?? null,
        maskedNumber: account.maskedNumber,
        accountNumber: account.accountNumber,
        sortOrder: index,
      });
    });
  });
  seed(buildPersonaAccounts(persona));
}

/** The persona's accounts in display order (seeds on first read if empty). */
export function readAccounts(cif: string): Account[] {
  seedIfEmpty(cif);
  const rows = getDb()
    .prepare("SELECT * FROM accounts WHERE cif = ? ORDER BY sort_order ASC")
    .all(cif) as AccountRow[];
  return rows.map(toAccount);
}

/** Thrown when the debit targets an account the persona doesn't have (route → 404). */
export class AccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`account ${accountId} not found`);
    this.name = "AccountNotFoundError";
  }
}

/**
 * Debit a real amount from an account (both `balance` and `available_balance`),
 * floored at 0 so a display value never goes negative (the transfer UI already
 * blocks an over-balance send; this is a defensive backstop). A non-positive or
 * non-finite amount is ignored. Returns the persona's accounts as they now read
 * back (the stored truth), so the caller renders the debited balance directly.
 *
 * H14/U1 — when `record` (the transfer's self-reported primary txn) is given,
 * the debit and the txn insert run in ONE SQLite transaction: either both land
 * or neither does, so a debited transfer can never lose its spend record. It is
 * also idempotent on the record id: a replay whose txn already exists (e.g. a
 * retry after a lost response) re-debits NOTHING. Throws `AccountNotFoundError`
 * (rolling back) when the account doesn't exist, rather than storing a txn
 * against no debit.
 */
export function debitAccount(cif: string, accountId: string, amount: number, record?: Transaction): Account[] {
  if (!Number.isFinite(amount) || amount <= 0) return readAccounts(cif);
  seedIfEmpty(cif);
  const db = getDb();
  const run = db.transaction(() => {
    if (record) {
      const exists = db.prepare("SELECT 1 FROM manual_transactions WHERE cif = ? AND id = ?").get(cif, record.id);
      if (exists) return; // replay — already debited + recorded together
    }
    const { changes } = db
      .prepare(
        `UPDATE accounts
            SET balance = MAX(0, balance - @amount),
                available_balance = MAX(0, available_balance - @amount)
          WHERE cif = @cif AND id = @id`,
      )
      .run({ cif, id: accountId, amount });
    if (changes === 0) throw new AccountNotFoundError(accountId);
    if (record) upsertManualTxn(cif, record);
  });
  run();
  return readAccounts(cif);
}
