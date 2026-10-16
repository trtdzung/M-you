/**
 * In-memory provider implementing every provider interface from a Dataset.
 * Pure reads; async to mirror a real network-backed adapter. Applies
 * TransactionQuery filtering server-side so callers get exactly what they ask.
 */

import type { JarConfig, Transaction, TransactionQuery } from "@/domain/models";
import type { Providers } from "../interfaces";
import type { PersonaId } from "./personas";
import type { Dataset } from "./fixtures/generate";

/** Persona-scoped storage key so jar config never leaks across personas (H5). */
const jarKey = (personaId: PersonaId) => `msb-pfm.jars.${personaId}`;

/**
 * Structural guard (M11). Any parse error or shape mismatch → treated as absent
 * so the caller seeds a default; never throws. `version` gates future migration.
 */
function isValidJarConfig(value: unknown): value is JarConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !Array.isArray(v.jars)) return false;
  if (!(v.incomeBasis === "auto" || typeof v.incomeBasis === "number")) return false;
  return v.jars.every((jar) => {
    if (typeof jar !== "object" || jar === null) return false;
    const j = jar as Record<string, unknown>;
    const a = j.allocation as Record<string, unknown> | undefined;
    return (
      typeof j.id === "string" &&
      typeof j.label === "string" &&
      Array.isArray(j.categoryIds) &&
      j.categoryIds.every((c) => typeof c === "string") &&
      !!a &&
      (a.mode === "percent" || a.mode === "amount") &&
      typeof a.value === "number"
    );
  });
}

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

export function createMockProvider(dataset: Dataset, personaId: PersonaId): Providers {
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
    async listBeneficiaries() {
      return clone(dataset.beneficiaries);
    },
    async getJarConfig() {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(jarKey(personaId));
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isValidJarConfig(parsed) ? parsed : null;
      } catch {
        return null; // corrupt/unavailable storage → seed a default
      }
    },
    async saveJarConfig(config) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(jarKey(personaId), JSON.stringify(config));
      } catch {
        // ignore storage errors (private mode, quota)
      }
    },
  };
}
