"use client";

/**
 * User-entered transactions (the ＋ FAB). These are *self-reported records*, not
 * money movement — adding one never executes, confirms, or transfers anything
 * (invariant #3). They persist locally and are merged into the transaction array
 * alongside provider data in `useFinancials`, so they count toward spend/report
 * exactly like a provider txn (every record carries `source: "self_reported"`,
 * never presented as bank-verified — invariant #5).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/domain/models";

const STORAGE_KEY = "msb-pfm.manual-txns";
export const MANUAL_ACCOUNT_ID = "self-reported";

/** The fields a user supplies in the Add-transaction form. */
export interface ManualTxnInput {
  amount: number;
  direction: "credit" | "debit";
  categoryId: string;
  merchantName: string;
  postedAt: string;
}

interface ManualTxnsContextValue {
  manualTxns: Transaction[];
  add: (input: ManualTxnInput) => void;
  remove: (id: string) => void;
}

const ManualTxnsContext = createContext<ManualTxnsContextValue | null>(null);

function isTransactionArray(v: unknown): v is Transaction[] {
  return Array.isArray(v) && v.every((t) => t && typeof t === "object" && typeof (t as Transaction).id === "string");
}

function read(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return isTransactionArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(next: Transaction[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    type: input.direction === "credit" ? "income" : "expense",
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
  const [manualTxns, setManualTxns] = useState<Transaction[]>([]);

  useEffect(() => {
    setManualTxns(read());
  }, []);

  const add = useCallback((input: ManualTxnInput) => {
    setManualTxns((prev) => {
      const next = [toTransaction(input), ...prev];
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setManualTxns((prev) => {
      const next = prev.filter((t) => t.id !== id);
      write(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ manualTxns, add, remove }), [manualTxns, add, remove]);
  return <ManualTxnsContext.Provider value={value}>{children}</ManualTxnsContext.Provider>;
}

export function useManualTxns(): ManualTxnsContextValue {
  const ctx = useContext(ManualTxnsContext);
  if (!ctx) throw new Error("useManualTxns must be used within <ManualTxnsProvider>");
  return ctx;
}
