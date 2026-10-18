import "server-only";

/**
 * "Tất toán sổ" (demo): move money from a savings account to the current
 * account before maturity, as one internal transfer (two legs, one
 * `transferGroupId`, like the fixtures), then log `fd_settled` for the Scam
 * Shield engine (T4 → DH5 «Rút cạn tiết kiệm rồi chuyển»).
 */

import { randomUUID } from "node:crypto";
import { CATEGORY, type Account, type Transaction } from "@/domain/models";
import { readAccounts } from "@/lib/accounts-store";
import { getDb } from "@/lib/db";
import { readTransactions } from "@/lib/transactions-store";
import { engineNow } from "./clock";
import { recordEvent } from "./events";

export class SettleError extends Error {}

function leg(base: Omit<Transaction, "accountId" | "direction" | "merchantName" | "merchantNormalizedName">, accountId: string, direction: "debit" | "credit", merchantName: string): Transaction {
  return { ...base, id: `${base.id}-${direction}`, accountId, direction, merchantName, merchantNormalizedName: "fd settle" };
}

/** Settles `amount` of a savings account into the current account; returns the accounts after. */
export function settleSavings(cif: string, savingsAccountId: string, amount: number): { accounts: Account[]; savingsBefore: number } {
  readTransactions(cif); // seed history first (see credit-store)
  const accounts = readAccounts(cif);
  const savings = accounts.find(a => a.id === savingsAccountId && a.type === "savings");
  const current = accounts.find(a => a.type === "current");
  if (!savings || !current) throw new SettleError("savings account not found");
  if (!(amount > 0) || amount > savings.balance) throw new SettleError("amount is more than the savings balance");
  const savingsBefore = accounts.filter(a => a.type === "savings").reduce((sum, a) => sum + a.balance, 0);
  const now = engineNow(cif);
  const base = {
    id: `fd-${randomUUID()}`, postedAt: now.toISOString(), amount, currency: "VND", type: "transfer" as const,
    categoryId: CATEGORY.transfer, status: "posted" as const, source: "mock" as const, isRecurring: false, userEdited: false,
    transferGroupId: `fd-${randomUUID()}`, note: "Tất toán sổ trước hạn",
  };
  const db = getDb();
  db.transaction(() => {
    const move = db.prepare("UPDATE accounts SET balance = balance + @delta, available_balance = available_balance + @delta WHERE cif = @cif AND id = @id");
    move.run({ cif, id: savings.id, delta: -amount });
    move.run({ cif, id: current.id, delta: amount });
    const insert = db.prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)");
    for (const txn of [leg(base, savings.id, "debit", "Tất toán sổ tiết kiệm"), leg(base, current.id, "credit", "Nhận tiền tất toán sổ")]) {
      insert.run(cif, txn.id, txn.postedAt, JSON.stringify(txn));
    }
    recordEvent(cif, "fd_settled", { amount, savingsBefore, early: true }, now.getTime());
  })();
  return { accounts: readAccounts(cif), savingsBefore };
}
