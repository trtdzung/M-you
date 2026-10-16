"use client";

/**
 * User-entered transactions (the ＋ FAB). These are *self-reported records*, not
 * money movement — adding one never executes, confirms, or transfers anything
 * (invariant #3). They persist locally and are merged into the transaction array
 * alongside provider data in `useFinancials`, so they count toward spend/report
 * exactly like a provider txn (every record carries `source: "self_reported"`,
 * never presented as bank-verified — invariant #5).
 *
 * Storage is scoped per persona (`msb-pfm.manual-txns.<cif>`): each persona's
 * self-reported records — including recipient names on transfer txns — stay
 * isolated, and the store re-loads when the persona switches (H: never leak a
 * record across personas). The legacy global key is intentionally NOT migrated
 * (prototype, mock data).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Transaction } from "@/domain/models";
import { usePersona } from "@/providers/context";

const STORAGE_PREFIX = "msb-pfm.manual-txns";
export const MANUAL_ACCOUNT_ID = "self-reported";

/** The fields a user supplies in the Add-transaction form. */
export interface ManualTxnInput {
  amount: number;
  direction: "credit" | "debit";
  categoryId: string;
  merchantName: string;
  postedAt: string;
  /** Explicit transaction type; defaults to income/expense inferred from `direction`. */
  type?: Transaction["type"];
}

interface ManualTxnsContextValue {
  manualTxns: Transaction[];
  /** Record a self-reported txn; returns the new txn id (for later `update`). */
  add: (input: ManualTxnInput) => string;
  /**
   * Patch category/type of an existing record. Returns `true` when a record
   * matched and was updated, `false` when no record has that id (never throws) —
   * callers rely on this to only reflect a successful edit in the UI.
   */
  update: (id: string, patch: Partial<Pick<Transaction, "categoryId" | "type">>) => boolean;
  remove: (id: string) => void;
}

const ManualTxnsContext = createContext<ManualTxnsContextValue | null>(null);

function isTransactionArray(v: unknown): v is Transaction[] {
  return Array.isArray(v) && v.every((t) => t && typeof t === "object" && typeof (t as Transaction).id === "string");
}

function read(key: string): Transaction[] {
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

function write(key: string, next: Transaction[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
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
function toTransaction(input: ManualTxnInput): Transaction {
  return {
    id: newId(),
    accountId: MANUAL_ACCOUNT_ID,
    postedAt: input.postedAt,
    amount: Math.abs(input.amount),
    currency: "VND",
    direction: input.direction,
    type: input.type ?? (input.direction === "credit" ? "income" : "expense"),
    merchantName: input.merchantName,
    merchantNormalizedName: input.merchantName.toLowerCase(),
    categoryId: input.categoryId,
    status: "posted",
    source: "self_reported",
    isRecurring: false,
    userEdited: true,
  };
}

export function ManualTxnsProvider({ children }: { children: React.ReactNode }) {
  const { persona } = usePersona();
  const key = `${STORAGE_PREFIX}.${persona.cif}`;
  const [manualTxns, setManualTxns] = useState<Transaction[]>([]);
  // Mirror of the current array so `add`/`update` can compute their return value
  // synchronously (a setState updater's run timing is not guaranteed).
  const txnsRef = useRef<Transaction[]>([]);

  const apply = useCallback((key: string, next: Transaction[]) => {
    txnsRef.current = next;
    write(key, next);
    setManualTxns(next);
  }, []);

  // Load on mount and whenever the persona (storage key) changes. Reset to []
  // FIRST so the previous persona's records never linger while the new key loads.
  useEffect(() => {
    txnsRef.current = [];
    setManualTxns([]);
    const loaded = read(key);
    txnsRef.current = loaded;
    setManualTxns(loaded);
  }, [key]);

  const add = useCallback(
    (input: ManualTxnInput): string => {
      const txn = toTransaction(input);
      apply(key, [txn, ...txnsRef.current]);
      return txn.id;
    },
    [key, apply],
  );

  const update = useCallback(
    (id: string, patch: Partial<Pick<Transaction, "categoryId" | "type">>): boolean => {
      if (!txnsRef.current.some((t) => t.id === id)) return false;
      apply(
        key,
        txnsRef.current.map((t) => (t.id === id ? { ...t, ...patch, userEdited: true } : t)),
      );
      return true;
    },
    [key, apply],
  );

  const remove = useCallback(
    (id: string) => {
      apply(
        key,
        txnsRef.current.filter((t) => t.id !== id),
      );
    },
    [key, apply],
  );

  const value = useMemo(() => ({ manualTxns, add, update, remove }), [manualTxns, add, update, remove]);
  return <ManualTxnsContext.Provider value={value}>{children}</ManualTxnsContext.Provider>;
}

export function useManualTxns(): ManualTxnsContextValue {
  const ctx = useContext(ManualTxnsContext);
  if (!ctx) throw new Error("useManualTxns must be used within <ManualTxnsProvider>");
  return ctx;
}
