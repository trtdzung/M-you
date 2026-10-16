/** Test helpers: build canonical transactions concisely. */

import type { Transaction } from "@/domain/models";

let seq = 0;

export function txn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: overrides.id ?? `t${seq}`,
    accountId: overrides.accountId ?? "acc_current",
    postedAt: overrides.postedAt ?? "2026-06-10T10:00:00.000Z",
    amount: overrides.amount ?? 100_000,
    currency: "VND",
    direction: overrides.direction ?? "debit",
    type: overrides.type ?? "expense",
    merchantName: overrides.merchantName ?? "Cửa hàng",
    merchantNormalizedName: overrides.merchantNormalizedName ?? "cua hang",
    categoryId: overrides.categoryId ?? "dining",
    status: overrides.status ?? "posted",
    source: overrides.source ?? "mock",
    isRecurring: overrides.isRecurring ?? false,
    userEdited: overrides.userEdited ?? false,
    relatedTransactionId: overrides.relatedTransactionId,
    transferGroupId: overrides.transferGroupId,
  };
}
