/**
 * In-memory provider implementing every provider interface from a Dataset.
 * Pure reads; async to mirror a real network-backed adapter. Applies
 * TransactionQuery filtering server-side so callers get exactly what they ask.
 */

import type { Asset, Liability, Transaction, TransactionQuery } from "@/domain/models";
import {
  ASSET_STORE_VERSION,
  isUserRecordStore,
  isValidAssetRecord,
  isValidLiabilityRecord,
  LIABILITY_STORE_VERSION,
  type UserRecordStore,
} from "@/domain/models/asset-liability-input";
import {
  GOAL_STORE_VERSION,
  isValidGoalRecord,
  type GoalRecord,
} from "@/domain/models/goal-input";
import {
  personaLocalStorageResource,
  type PersonaLocalStorageResource,
} from "@/lib/persona-storage";
import type { Providers, UserRecordsResult } from "../interfaces";
import { apiError } from "../api-error";
import { createCategoryApi } from "./mock-categories";
import type { PersonaId } from "./personas";
import type { Dataset } from "./fixtures/generate";

/**
 * A persona-scoped, versioned collection of user-authored records with a
 * PER-RECORD guard (red-team #4). Built on the shared `personaLocalStorageResource`
 * so persona keys + SSR/try-catch live in one place (DRY, red-team #6). Generic
 * so Phase 05 (goals) reuses it verbatim; a corrupt element is dropped and its
 * valid siblings are kept — a single bad record never wipes the store (#6).
 */
function userRecordStore<T extends { id: string }>(
  namespace: string,
  personaId: PersonaId,
  version: number,
  isValid: (value: unknown) => value is T,
) {
  const resource: PersonaLocalStorageResource<UserRecordStore<T>> = personaLocalStorageResource({
    namespace,
    personaId,
    guard: isUserRecordStore as (v: unknown) => v is UserRecordStore<T>,
    seed: () => ({ version, records: [] }),
  });

  /** Read the envelope, then keep only guard-valid elements + count the drops. */
  function readValid(): { valid: T[]; dropped: number } {
    const stored = resource.read();
    const raw: unknown[] = stored?.records ?? [];
    const valid = raw.filter(isValid);
    return { valid, dropped: raw.length - valid.length };
  }

  function persist(records: T[]): void {
    resource.save({ version, records });
  }

  return {
    list(): UserRecordsResult<T> {
      const { valid, dropped } = readValid();
      return { records: clone(valid), dropped };
    },
    create(record: T): void {
      persist([...readValid().valid, record]);
    },
    update(record: T): void {
      persist(readValid().valid.map((r) => (r.id === record.id ? record : r)));
    },
    remove(id: string): void {
      persist(readValid().valid.filter((r) => r.id !== id));
    },
  };
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

export function createMockProvider(dataset: Dataset, personaId: PersonaId, cif: string): Providers {
  // Persistence-only user-record stores (client-local; a real MSB adapter maps
  // these to CRUD endpoints without changing the contract — invariant #4).
  const assetStore = userRecordStore<Asset>("assets", personaId, ASSET_STORE_VERSION, isValidAssetRecord);
  const liabilityStore = userRecordStore<Liability>("liabilities", personaId, LIABILITY_STORE_VERSION, isValidLiabilityRecord);
  const goalStore = userRecordStore<GoalRecord>("goals", personaId, GOAL_STORE_VERSION, isValidGoalRecord);

  return {
    // The taxonomy endpoints (`/api/categories*`) — see `mock-categories.ts`.
    ...createCategoryApi(cif),
    async listAccounts() {
      // CASA is DB-backed now (SQLite `accounts`, seeded from the same builder
      // as the fixtures). A real MSB adapter maps this to a balance endpoint
      // without changing the contract (invariant #4).
      const res = await fetch(`/api/accounts?cif=${encodeURIComponent(cif)}`);
      if (!res.ok) return [];
      return res.json();
    },
    async listTransactions(query?: TransactionQuery) {
      // Transaction history is DB-backed now (SQLite `transactions`, seeded from
      // the same generator as the fixtures). The period bound is pushed to the
      // server; the remaining filters apply here. A failed load THROWS rather than
      // returning [] — an empty history would read as "no spending", a silent 0
      // (invariant #6); callers surface their error state instead.
      const params = new URLSearchParams({ cif });
      if (query?.from) params.set("from", query.from);
      if (query?.to) params.set("to", query.to);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error(`listTransactions failed: ${res.status}`);
      const txns = (await res.json()) as Transaction[];
      const rows = query ? txns.filter((t) => matches(t, query)) : txns;
      return rows.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
    },
    async listAssets() {
      return clone(dataset.assets); // SEED ONLY — user records never folded here (#3)
    },
    async getUserAssets() {
      return assetStore.list();
    },
    async createAsset(record) {
      assetStore.create(record);
    },
    async updateAsset(record) {
      assetStore.update(record);
    },
    async deleteAsset(id) {
      assetStore.remove(id);
    },
    async listLiabilities() {
      return clone(dataset.liabilities); // SEED ONLY (#3)
    },
    async getUserLiabilities() {
      return liabilityStore.list();
    },
    async createLiability(record) {
      liabilityStore.create(record);
    },
    async updateLiability(record) {
      liabilityStore.update(record);
    },
    async deleteLiability(id) {
      liabilityStore.remove(id);
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
      return clone(dataset.goals); // SEED ONLY — user records never folded here (#3)
    },
    async getUserGoals() {
      return goalStore.list();
    },
    async createGoal(record) {
      goalStore.create(record);
    },
    async updateGoal(record) {
      goalStore.update(record);
    },
    async deleteGoal(id) {
      goalStore.remove(id);
    },
    async listBeneficiaries() {
      const res = await fetch(`/api/beneficiaries?cif=${encodeURIComponent(cif)}`);
      if (!res.ok) return [];
      return res.json();
    },
    async createBeneficiary(record) {
      const res = await fetch("/api/beneficiaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif, ...record }),
      });
      if (!res.ok) throw new Error(`createBeneficiary failed: ${res.status}`);
      return res.json();
    },
    async getJarConfig() {
      // A failed load THROWS (U10): an empty `jars: []` would read as "no jars
      // yet" and the UI would offer "Thêm hũ" instead of an error + retry.
      const res = await fetch(`/api/jars?cif=${encodeURIComponent(cif)}`);
      if (!res.ok) throw await apiError("getJarConfig", res);
      return res.json();
    },
    async createJar(jar) {
      const res = await fetch("/api/jars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif, jar }),
      });
      if (!res.ok) throw await apiError("createJar", res);
      return res.json();
    },
    async updateJar(id, patch) {
      // `JSON.stringify` drops a key whose value is `undefined` entirely, but
      // the API's PATCH contract uses `null` to mean "clear this field back
      // to chưa đặt" (invariant #6) — an explicitly-present `undefined` (e.g.
      // `{ budgetLimit: undefined }` from "Hạn mức: để trống") must survive
      // the wire as `null`, or the clear silently becomes a no-op.
      const wirePatch = Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [key, value === undefined ? null : value]),
      );
      const res = await fetch(`/api/jars/${encodeURIComponent(id)}?cif=${encodeURIComponent(cif)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: wirePatch }),
      });
      if (!res.ok) throw await apiError("updateJar", res);
      return res.json();
    },
    async updateJars(patches) {
      // Same `undefined` → `null` wire-encoding as `updateJar` (clear a field),
      // per patch. Batched into ONE PATCH so the server applies them in a single
      // transaction with one cap check (invariant: no partial/racy write).
      const wirePatches = Object.fromEntries(
        Object.entries(patches).map(([jarId, patch]) => [
          jarId,
          Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === undefined ? null : value])),
        ]),
      );
      const res = await fetch(`/api/jars?cif=${encodeURIComponent(cif)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif, patches: wirePatches }),
      });
      if (!res.ok) throw await apiError("updateJars", res);
      return res.json();
    },
    async removeJar(id) {
      const res = await fetch(`/api/jars/${encodeURIComponent(id)}?cif=${encodeURIComponent(cif)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw await apiError("removeJar", res);
      return res.json();
    },
    async assignCategory(categoryId, jarId) {
      const res = await fetch(`/api/jars/${encodeURIComponent(jarId)}/categories?cif=${encodeURIComponent(cif)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!res.ok) throw await apiError("assignCategory", res);
      return res.json();
    },
    async replaceJars(jars) {
      const res = await fetch("/api/jars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif, jars }),
      });
      if (!res.ok) throw await apiError("replaceJars", res);
      return res.json();
    },
    async applyAccountDebit(accountId, amount, record) {
      const res = await fetch("/api/accounts/debit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif, accountId, amount, ...(record ? { txn: record } : {}) }),
      });
      if (!res.ok) throw new Error(`applyAccountDebit failed: ${res.status}`);
    },
  };
}
