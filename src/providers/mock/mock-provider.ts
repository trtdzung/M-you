/**
 * In-memory provider implementing every provider interface from a Dataset.
 * Pure reads; async to mirror a real network-backed adapter. Applies
 * TransactionQuery filtering server-side so callers get exactly what they ask.
 */

import type { Transaction, TransactionQuery } from "@/domain/models";
import type { Providers } from "../interfaces";
import type { Dataset } from "./fixtures/generate";

function matches(txn: Transaction, q: TransactionQuery): boolean {
  if (q.from && txn.postedAt < q.from) return false;
  if (q.to && txn.postedAt > q.to) return false;
  if (q.accountId && txn.accountId !== q.accountId) return false;
  if (q.categoryId && txn.categoryId !== q.categoryId) return false;
  if (q.status && txn.status !== q.status) return false;
  if (q.type && txn.type !== q.type) return false;
  if (q.search) {
    const needle = q.search.trim().toLowerCase();
    if (needle && !txn.merchantName.toLowerCase().includes(needle) && !txn.merchantNormalizedName.includes(needle)) {
      return false;
    }
  }
  return true;
}

/** Clone so callers cannot mutate the underlying fixture arrays. */
function clone<T>(items: T[]): T[] {
  return items.map((item) => ({ ...item }));
}

export function createMockProvider(dataset: Dataset): Providers {
  return {
    async listAccounts() {
      return clone(dataset.accounts);
    },
    async listTransactions(query?: TransactionQuery) {
      const rows = query ? dataset.transactions.filter((t) => matches(t, query)) : dataset.transactions;
      return clone(rows).sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
    },
    async listAssets() {
      return clone(dataset.assets);
    },
    async listLiabilities() {
      return clone(dataset.liabilities);
    },
    async getMonthlySnapshots() {
      return clone(dataset.snapshots);
    },
    async listMockProducts() {
      return clone(dataset.products);
    },
    async getBudgets() {
      return clone(dataset.budgets);
    },
    async listGoals() {
      return clone(dataset.goals);
    },
  };
}
