/**
 * In-memory provider implementing every provider interface from a Dataset.
 * Pure reads; async to mirror a real network-backed adapter. Applies
 * TransactionQuery filtering server-side so callers get exactly what they ask.
 */

import type { Asset, Jar, JarConfig, Liability, Transaction, TransactionQuery } from "@/domain/models";
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
import type { PersonaId } from "./personas";
import type { Dataset } from "./fixtures/generate";

/** Persona-scoped storage key so jar config never leaks across personas (H5). */
const jarKey = (personaId: PersonaId) => `msb-pfm.jars.${personaId}`;

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

/**
 * True for a structurally-sound jar (shared by the v3 guard and v2 migration).
 * `budgetLimit` is optional (`undefined` = chưa đặt, invariant #6); when present
 * it must be a finite, non-negative amount so a corrupted record never smuggles a
 * NaN/Infinity/negative past this storage boundary. `color`/`icon` are optional
 * presentation overrides. The legacy `allocation` field is ignored (dropped on
 * migration), so a v2 jar validates on its shared fields alone.
 */
function isValidJar(jar: unknown): boolean {
  if (typeof jar !== "object" || jar === null) return false;
  const j = jar as Record<string, unknown>;
  if (typeof j.id !== "string" || typeof j.label !== "string") return false;
  if (!Array.isArray(j.categoryIds) || !j.categoryIds.every((c) => typeof c === "string")) return false;
  if (
    j.budgetLimit !== undefined &&
    !(typeof j.budgetLimit === "number" && Number.isFinite(j.budgetLimit) && j.budgetLimit >= 0)
  ) {
    return false;
  }
  if (
    j.actualAmount !== undefined &&
    !(typeof j.actualAmount === "number" && Number.isFinite(j.actualAmount) && j.actualAmount >= 0)
  ) {
    return false;
  }
  if (j.color !== undefined && typeof j.color !== "string") return false;
  if (j.icon !== undefined && typeof j.icon !== "string") return false;
  return true;
}

/**
 * Structural guard (M11) for a current v3 jar config (BIDV wallet model — no
 * `allocation`). Any parse error or shape mismatch → treated as absent so the
 * caller seeds a default; never throws.
 */
function isValidJarConfig(value: unknown): value is JarConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 3 || !Array.isArray(v.jars)) return false;
  return v.jars.every(isValidJar);
}

/**
 * Load-time migration (phase 08). A stored v3 loads unchanged. A legacy v2
 * (balance-lens — carried `allocation`) is migrated FORWARD: allocation dropped,
 * `budgetLimit`/`color`/`icon` kept, version bumped to 3 — so an upgrading user
 * is never wiped. Anything else (v1, garbage, malformed jar) → null → reseed.
 */
function migrateStoredJarConfig(value: unknown): JarConfig | null {
  if (isValidJarConfig(value)) return value;
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 2 || !Array.isArray(v.jars) || !v.jars.every(isValidJar)) return null;
  const jars: Jar[] = (v.jars as Record<string, unknown>[]).map((j) => {
    const jar: Jar = { id: j.id as string, label: j.label as string, categoryIds: j.categoryIds as string[] };
    if (j.budgetLimit !== undefined) jar.budgetLimit = j.budgetLimit as number;
    if (j.color !== undefined) jar.color = j.color as string;
    if (j.icon !== undefined) jar.icon = j.icon as string;
    return jar;
  });
  return { version: 3, jars };
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

/** A finite, non-negative amount per account id — a corrupt/foreign shape is treated as absent (reseeds to `{}`). */
function isValidAdjustmentMap(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
}

export function createMockProvider(dataset: Dataset, personaId: PersonaId, cif: string): Providers {
  // Persistence-only user-record stores (client-local; a real MSB adapter maps
  // these to CRUD endpoints without changing the contract — invariant #4).
  const assetStore = userRecordStore<Asset>("assets", personaId, ASSET_STORE_VERSION, isValidAssetRecord);
  const liabilityStore = userRecordStore<Liability>("liabilities", personaId, LIABILITY_STORE_VERSION, isValidLiabilityRecord);
  const goalStore = userRecordStore<GoalRecord>("goals", personaId, GOAL_STORE_VERSION, isValidGoalRecord);
  const accountAdjustments = personaLocalStorageResource<Record<string, number>>({
    namespace: "account-adjustments",
    personaId,
    guard: isValidAdjustmentMap,
    seed: () => ({}),
  });

  return {
    async listAccounts() {
      return clone(dataset.accounts);
    },
    async listTransactions(query?: TransactionQuery) {
      const rows = query ? dataset.transactions.filter((t) => matches(t, query)) : dataset.transactions;
      return clone(rows).sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
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
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(jarKey(personaId));
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return migrateStoredJarConfig(parsed);
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
    async getAccountAdjustments() {
      return accountAdjustments.load();
    },
    async applyAccountDebit(accountId, amount) {
      const current = accountAdjustments.load();
      accountAdjustments.save({ ...current, [accountId]: (current[accountId] ?? 0) + amount });
    },
  };
}
