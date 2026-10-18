import "server-only";

/**
 * Test tools: N rising debits to one new recipient, spaced inside the last
 * 10 minutes, so the next larger transfer continues signal T6.
 */

import { randomUUID } from "node:crypto";
import { CATEGORY, type Transaction } from "@/domain/models";
import { AccountNotFoundError, debitAccount } from "@/lib/accounts-store";
import { getDb } from "@/lib/db";
import { engineNow } from "./clock";
import type { SecurityEvent } from "./event-types";
import { recordEvent } from "./events";

const MINUTE_MS = 60_000;

export class ChainError extends Error {}

export type ChainInput = {
  accountId: string;
  count: number;
  recipientName: string;
  recipientAccount: string;
  recipientBank: string;
};

const normalized = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().trim();

/** Debits `count` rising amounts (100k, 200k, …) and logs each `transfer_out`. */
export function recordRisingTransfers(cif: string, input: ChainInput): SecurityEvent<"transfer_out">[] {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 5) throw new ChainError("count is invalid");
  const digits = input.recipientAccount.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 34) throw new ChainError("account is invalid");
  if (!input.recipientName.trim() || input.recipientName.length > 80) throw new ChainError("name is invalid");
  if (!input.recipientBank.trim() || input.recipientBank.length > 80) throw new ChainError("bank is invalid");
  if (!input.accountId.trim() || input.accountId.length > 64) throw new ChainError("accountId is invalid");
  const now = engineNow(cif).getTime();
  const last4 = digits.slice(-4);
  const name = input.recipientName.trim();
  const bank = input.recipientBank.trim();
  const events: SecurityEvent<"transfer_out">[] = [];
  const db = getDb();
  db.transaction(() => {
    for (let i = 0; i < input.count; i++) {
      const amount = 100_000 * (i + 1);
      const at = now - (input.count - i) * MINUTE_MS;
      const id = `sim-${randomUUID()}`;
      const txn: Transaction = {
        id, accountId: input.accountId, postedAt: new Date(at).toISOString(), amount, currency: "VND",
        direction: "debit", type: "transfer", merchantName: name, merchantNormalizedName: normalized(name),
        categoryId: CATEGORY.transfer, status: "posted", source: "self_reported", isRecurring: false, userEdited: false,
        counterpartyAccountNumber: digits, counterpartyBankName: bank, note: "Giả lập chuỗi lệnh",
      };
      try {
        debitAccount(cif, input.accountId, amount, txn);
      } catch (err) {
        if (err instanceof AccountNotFoundError) throw err;
        throw new ChainError("debit failed");
      }
      events.push(recordEvent(cif, "transfer_out", {
        txnId: id, amount, recipientName: name, recipientLast4: last4, recipientBank: bank, isNewPayee: true,
      }, at));
    }
  })();
  return events;
}
