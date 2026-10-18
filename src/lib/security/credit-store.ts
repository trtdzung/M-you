import "server-only";

/**
 * Money IN (demo): credit one of the persona's accounts and record the bank
 * credit in the same DB transaction, then log `incoming_credit` for the Scam
 * Shield engine (T7a/T7b, BT3–BT5). The mirror of `debitAccount`; only the test
 * tools call it, so it stands in for the core banking credit feed.
 */

import { randomUUID } from "node:crypto";
import { INCOME, type Account, type Transaction } from "@/domain/models";
import { readAccounts } from "@/lib/accounts-store";
import { getDb } from "@/lib/db";
import { readTransactions } from "@/lib/transactions-store";
import { engineNow } from "./clock";
import type { IncomeKind } from "./event-types";
import { recordEvent } from "./events";

export class CreditAccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`account ${accountId} not found`);
  }
}

export type CreditInput = {
  accountId: string;
  amount: number;
  sender: { name: string; account: string; bank: string };
  memo?: string;
  kind: IncomeKind;
  /** Replays with the same id credit nothing twice. */
  txnId?: string;
};

const lastFour = (account: string) => account.replace(/\D/g, "").slice(-4);
const normalized = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();

/** Credits the account; returns the persona's accounts and the stored credit. */
export function creditAccount(cif: string, input: CreditInput): { accounts: Account[]; transaction: Transaction } {
  // Seed the bank history first: the lazy seed skips a persona that already has rows.
  readTransactions(cif);
  readAccounts(cif);
  const db = getDb();
  const id = input.txnId ?? `credit-${randomUUID()}`;
  const postedAt = engineNow(cif);
  // Every kind is money-IN ("income"): a `transfer` type is read as an internal move and left out of Tiền vào.
  const transaction: Transaction = {
    id,
    accountId: input.accountId,
    postedAt: postedAt.toISOString(),
    amount: input.amount,
    currency: "VND",
    direction: "credit",
    type: "income",
    merchantName: input.sender.name,
    merchantNormalizedName: normalized(input.sender.name),
    categoryId: INCOME,
    status: "posted",
    source: "mock",
    isRecurring: input.kind === "salary",
    userEdited: false,
    counterpartyAccountNumber: input.sender.account,
    counterpartyBankName: input.sender.bank,
    ...(input.memo ? { note: input.memo } : {}),
  };

  const run = db.transaction(() => {
    const exists = db.prepare("SELECT payload FROM transactions WHERE cif = ? AND id = ?").get(cif, id) as { payload: string } | undefined;
    if (exists) return JSON.parse(exists.payload) as Transaction; // replay — already credited
    const { changes } = db
      .prepare("UPDATE accounts SET balance = balance + @amount, available_balance = available_balance + @amount WHERE cif = @cif AND id = @id")
      .run({ cif, id: input.accountId, amount: input.amount });
    if (changes === 0) throw new CreditAccountNotFoundError(input.accountId);
    db.prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
      .run(cif, id, transaction.postedAt, JSON.stringify(transaction));
    recordEvent(cif, "incoming_credit", {
      txnId: id,
      accountId: input.accountId,
      amount: input.amount,
      senderName: input.sender.name,
      senderLast4: lastFour(input.sender.account),
      senderBank: input.sender.bank,
      kind: input.kind,
    }, postedAt.getTime());
    return transaction;
  });
  const stored = run();
  return { accounts: readAccounts(cif), transaction: stored };
}
