"use client";

/**
 * User-entered transactions (the ＋ FAB) and the record a confirmed transfer
 * writes on its success card. These are *self-reported records*, not money
 * movement — adding one never executes, confirms, or transfers anything
 * (invariant #3). They are merged into the transaction array alongside provider
 * data in `useFinancials`, so they count toward spend/report exactly like a
 * provider txn (every record carries `source: "self_reported"`, never presented
 * as bank-verified — invariant #5).
 *
 * Persistence: SQLite via `/api/manual-transactions`, scoped per persona (`cif`),
 * so records survive reloads, dev-server restarts, and devices (previously
 * localStorage-only). The browser never touches the DB directly — only this route
 * (invariant #4). Writes are OPTIMISTIC: the local state updates synchronously
 * (so `add` can return the new id and `update` a found-boolean, as callers rely
 * on) and the API call persists in the background; a failed write is logged and
 * the next persona load re-syncs from the stored truth.
 *
 * One-time migration: on first load of a persona whose DB rows are empty, any
 * legacy localStorage records for that persona are imported into the DB and the
 * localStorage key is cleared.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Transaction } from "@/domain/models";
import { usePersona } from "@/providers/context";

const STORAGE_PREFIX = "msb-pfm.manual-txns";
const API_PATH = "/api/manual-transactions";
const MANUAL_ACCOUNT_ID = "self-reported";

/** The fields a user supplies in the Add-transaction form. */
export interface ManualTxnInput {
  amount: number;
  direction: "credit" | "debit";
  categoryId: string;
  merchantName: string;
  postedAt: string;
  /** Explicit transaction type; defaults to expense/refund inferred from `direction` (income was removed). */
  type?: Transaction["type"];
  /** Optional free-text memo ("Nội dung"); kept as a purpose-suggestion signal. */
  note?: string;
  /**
   * Inter-jar rebalance meta (Phase 03). Set ONLY when recording a rebalance txn
   * (`categoryId: REBALANCE_CATEGORY`, `type: "transfer"`). `buildManualTxn` carries
   * it onto the built Transaction so it survives the POST round-trip — WITHOUT this
   * passthrough the client would silently drop the meta before it ever reached the API.
   */
  rebalance?: Transaction["rebalance"];
}

/**
 * `status` is on the whitelist (RT-fix H3): a refund/reversal of a trigger txn
 * (or a partial refund that lowers its effective spend) is recorded by patching
 * `status`, which the auto-fund reconciler reacts to — shrinking/growing/removing
 * the linked `dieu-chinh-hu` rebalance rather than blanket-deleting it.
 */
type ManualTxnPatch = Partial<Pick<Transaction, "categoryId" | "type" | "transferPurpose" | "note" | "rebalance" | "status" | "amount">>;

interface ManualTxnsContextValue {
  manualTxns: Transaction[];
  /** Record a self-reported txn; returns the new txn id (for later `update`). */
  add: (input: ManualTxnInput) => string;
  /**
   * Patch category/type of an existing record. Returns `true` when a record
   * matched and was updated, `false` when no record has that id (never throws) —
   * callers rely on this to only reflect a successful edit in the UI.
   */
  update: (id: string, patch: ManualTxnPatch) => boolean;
  remove: (id: string) => void;
  /**
   * Record a self-reported txn and AWAIT its persistence (H14/U1): the local
   * state updates optimistically, but a failed POST rolls the record back and
   * rejects — so a caller (e.g. the transfer confirm's rebalance legs) can never
   * report a write as done when the server never stored it.
   */
  addPersisted: (input: ManualTxnInput) => Promise<string>;
  /**
   * Add an ALREADY-PERSISTED txn to local state without re-posting it — used
   * after `/api/accounts/debit` stored the transfer's primary txn atomically
   * with the debit (the server is the one that wrote it).
   */
  adopt: (txn: Transaction) => void;
  /**
   * Remove every rebalance txn triggered by `triggerTxnId` (SC1: rebalances are
   * `dieu-chinh-hu`-tagged txns keyed by `rebalance.triggerTxnId`). Returns the
   * removed ids. The single unwind point for undo (C4), re-categorize/re-amount
   * (H5) and refund reconciliation (H3) — so a changed trigger never stacks two
   * rebalances.
   */
  removeByTrigger: (triggerTxnId: string) => string[];
}

const ManualTxnsContext = createContext<ManualTxnsContextValue | null>(null);

function isTransactionArray(v: unknown): v is Transaction[] {
  return Array.isArray(v) && v.every((t) => t && typeof t === "object" && typeof (t as Transaction).id === "string");
}

/** Read the legacy localStorage records for a persona (migration source only). */
function readLegacy(key: string): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return isTransactionArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLegacy(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

function newId(): string {
  try {
    return `manual-${crypto.randomUUID()}`;
  } catch {
    return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Build a full, valid Transaction from user input — self-reported, posted. */
export function buildManualTxn(input: ManualTxnInput): Transaction {
  return {
    id: newId(),
    accountId: MANUAL_ACCOUNT_ID,
    postedAt: input.postedAt,
    amount: Math.abs(input.amount),
    currency: "VND",
    direction: input.direction,
    type: input.type ?? (input.direction === "credit" ? "refund" : "expense"),
    merchantName: input.merchantName,
    merchantNormalizedName: input.merchantName.toLowerCase(),
    categoryId: input.categoryId,
    status: "posted",
    source: "self_reported",
    isRecurring: false,
    userEdited: true,
    ...(input.note ? { note: input.note } : {}),
    ...(input.rebalance ? { rebalance: input.rebalance } : {}),
  };
}

// --- API helpers (the only DB boundary; mocked via global.fetch in tests) ------

async function apiList(cif: string): Promise<Transaction[]> {
  const res = await fetch(`${API_PATH}?cif=${encodeURIComponent(cif)}`);
  if (!res.ok) throw new Error(`manual-txns list ${res.status}`);
  const data: unknown = await res.json();
  return isTransactionArray(data) ? data : [];
}

async function apiCreate(cif: string, txn: Transaction): Promise<void> {
  const res = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, txn }),
  });
  if (!res.ok) throw new Error(`manual-txns create ${res.status}`);
}

async function apiPatch(cif: string, id: string, patch: ManualTxnPatch): Promise<void> {
  // JSON drops `undefined`, so an intended CLEAR (e.g. removing a stale
  // transferPurpose) is sent as `null`; the store treats null as "clear".
  const wire: Record<string, unknown> = {};
  if ("categoryId" in patch) wire.categoryId = patch.categoryId ?? null;
  if ("type" in patch) wire.type = patch.type ?? null;
  if ("transferPurpose" in patch) wire.transferPurpose = patch.transferPurpose ?? null;
  if ("note" in patch) wire.note = patch.note ?? null;
  // Rebalance meta is an object; `null` over the wire ⇒ CLEAR (Phase 05 unwind).
  if ("rebalance" in patch) wire.rebalance = patch.rebalance ?? null;
  // `status`/`amount` are non-clearable — only sent when a concrete value is set
  // (refund/reversal or amount edit of a trigger txn, H3/H5).
  if (patch.status !== undefined) wire.status = patch.status;
  if (patch.amount !== undefined) wire.amount = patch.amount;
  const res = await fetch(API_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, id, patch: wire }),
  });
  if (!res.ok) throw new Error(`manual-txns patch ${res.status}`);
}

async function apiRemove(cif: string, id: string): Promise<void> {
  const res = await fetch(`${API_PATH}?cif=${encodeURIComponent(cif)}&id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`manual-txns delete ${res.status}`);
}

function logWriteError(err: unknown): void {
  console.error("Manual-txn write failed", err);
}

/**
 * Fold any records added/patched optimistically WHILE a load was in flight back
 * into the freshly-loaded list (they're keyed by id, so a union never dupes).
 * Without this, the load's terminal `apply(rows)` — whose `rows` snapshot predates
 * the optimistic write — would clobber a just-entered txn off screen (RT#2).
 */
function mergeLocalExtras(loaded: Transaction[], current: Transaction[]): Transaction[] {
  if (current.length === 0) return loaded;
  const loadedIds = new Set(loaded.map((t) => t.id));
  const extras = current.filter((t) => !loadedIds.has(t.id));
  return extras.length ? [...extras, ...loaded] : loaded;
}

export function ManualTxnsProvider({ children }: { children: React.ReactNode }) {
  const { persona } = usePersona();
  const cif = persona.cif;
  const [manualTxns, setManualTxns] = useState<Transaction[]>([]);
  // Mirror of the current array so `add`/`update` can compute their return value
  // synchronously (a setState updater's run timing is not guaranteed).
  const txnsRef = useRef<Transaction[]>([]);

  const apply = useCallback((next: Transaction[]) => {
    txnsRef.current = next;
    setManualTxns(next);
  }, []);

  // Load on mount and whenever the persona changes. Reset to [] FIRST so the
  // previous persona's records never linger while the new persona loads. On a
  // fresh DB, import any legacy localStorage records once, then drop the key.
  useEffect(() => {
    let active = true;
    apply([]);
    const legacyKey = `${STORAGE_PREFIX}.${cif}`;
    (async () => {
      try {
        let rows = await apiList(cif);
        const legacy = readLegacy(legacyKey);
        if (legacy.length > 0) {
          // Import only the legacy rows the DB is still MISSING — idempotent and
          // resumable, so a retried partial failure never drops a record. Clear
          // localStorage only once every legacy id is confirmed persisted (never
          // just because the DB has some rows — that would strand un-imported
          // records on a prior partial failure, RT#1).
          const have = new Set(rows.map((t) => t.id));
          const missing = legacy.filter((t) => !have.has(t.id));
          if (missing.length > 0) {
            await Promise.all(missing.map((t) => apiCreate(cif, t)));
            rows = await apiList(cif);
          }
          const persisted = new Set(rows.map((t) => t.id));
          if (legacy.every((t) => persisted.has(t.id))) clearLegacy(legacyKey);
        }
        if (active) apply(mergeLocalExtras(rows, txnsRef.current));
      } catch (err) {
        // API unreachable → fall back to legacy localStorage so the app still works.
        console.error("Failed to load manual txns", err);
        if (active) apply(mergeLocalExtras(readLegacy(legacyKey), txnsRef.current));
      }
    })();
    return () => {
      active = false;
    };
  }, [cif, apply]);

  const add = useCallback(
    (input: ManualTxnInput): string => {
      const txn = buildManualTxn(input);
      apply([txn, ...txnsRef.current]); // optimistic
      apiCreate(cif, txn).catch(logWriteError);
      return txn.id;
    },
    [cif, apply],
  );

  const addPersisted = useCallback(
    async (input: ManualTxnInput): Promise<string> => {
      const txn = buildManualTxn(input);
      apply([txn, ...txnsRef.current]); // optimistic, rolled back on failure
      try {
        await apiCreate(cif, txn);
      } catch (err) {
        apply(txnsRef.current.filter((t) => t.id !== txn.id));
        throw err;
      }
      return txn.id;
    },
    [cif, apply],
  );

  const adopt = useCallback(
    (txn: Transaction) => {
      if (txnsRef.current.some((t) => t.id === txn.id)) return; // idempotent
      apply([{ ...txn, source: "self_reported" }, ...txnsRef.current]);
    },
    [apply],
  );

  const update = useCallback(
    (id: string, patch: ManualTxnPatch): boolean => {
      if (!txnsRef.current.some((t) => t.id === id)) return false;
      apply(txnsRef.current.map((t) => (t.id === id ? { ...t, ...patch, userEdited: true } : t))); // optimistic
      apiPatch(cif, id, patch).catch(logWriteError);
      return true;
    },
    [cif, apply],
  );

  const remove = useCallback(
    (id: string) => {
      apply(txnsRef.current.filter((t) => t.id !== id)); // optimistic
      apiRemove(cif, id).catch(logWriteError);
    },
    [cif, apply],
  );

  const removeByTrigger = useCallback(
    (triggerTxnId: string): string[] => {
      const victims = txnsRef.current.filter((t) => t.rebalance?.triggerTxnId === triggerTxnId);
      if (victims.length === 0) return [];
      apply(txnsRef.current.filter((t) => t.rebalance?.triggerTxnId !== triggerTxnId)); // optimistic
      victims.forEach((t) => apiRemove(cif, t.id).catch(logWriteError));
      return victims.map((t) => t.id);
    },
    [cif, apply],
  );

  const value = useMemo(
    () => ({ manualTxns, add, addPersisted, adopt, update, remove, removeByTrigger }),
    [manualTxns, add, addPersisted, adopt, update, remove, removeByTrigger],
  );
  return <ManualTxnsContext.Provider value={value}>{children}</ManualTxnsContext.Provider>;
}

export function useManualTxns(): ManualTxnsContextValue {
  const ctx = useContext(ManualTxnsContext);
  if (!ctx) throw new Error("useManualTxns must be used within <ManualTxnsProvider>");
  return ctx;
}
