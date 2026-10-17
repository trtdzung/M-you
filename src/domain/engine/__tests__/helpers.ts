/** Test helpers: build canonical transactions concisely. */

import type { Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";

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
    ...(overrides.rebalance ? { rebalance: overrides.rebalance } : {}),
  };
}

/**
 * A net-rebalance map (`jarId → Σ nhận − Σ cho`) as real pool legs — positive = a
 * pool→jar cover, negative = a jar→pool give-back — so `jarBalances` derives the
 * same net the engine would fold (tests stay on the real engine path).
 */
export function rebalanceLegs(net: Map<string, number> | undefined, postedAt: string): Transaction[] {
  return [...(net ?? [])]
    .filter(([, amount]) => Number.isFinite(amount) && amount !== 0)
    .map(([jarId, amount]) => {
      const [fromJarId, toJarId] = amount > 0 ? ["pool", jarId] : [jarId, "pool"];
      return txn({
        type: "transfer",
        categoryId: REBALANCE_CATEGORY,
        amount: Math.abs(amount),
        postedAt,
        rebalance: { fromJarId, toJarId, triggerTxnId: "trigger", origin: "auto" },
      });
    });
}
