"use client";

/**
 * In-session transaction corrections — a separate overlay, never a mutation of
 * provider data (invariant #4). Two kinds:
 *  - `categoryId` re-categorizes a transaction (merged onto the txn before any
 *    engine call, so cash flow + budgets recompute).
 *  - `hidden` excludes a transaction from spend/report totals WITHOUT deleting it
 *    (the row stays visible + searchable in the list). Exclusion is applied by
 *    dropping hidden rows from the array the engine sees (`useFinancials`), the
 *    same way reversed/pending are already excluded downstream.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/domain/models";

const STORAGE_KEY = "msb-pfm.corrections";

/** One transaction's overrides. Absent fields mean "no override". */
export interface Correction {
  categoryId?: string;
  hidden?: boolean;
}
export type Corrections = Record<string, Correction>; // txnId -> overrides

interface CorrectionsContextValue {
  corrections: Corrections;
  setCategory: (txnId: string, categoryId: string) => void;
  setHidden: (txnId: string, hidden: boolean) => void;
  /** Clear the category override only (keeps a hidden flag). */
  clearCategory: (txnId: string) => void;
  /** Clear all overrides for a transaction. */
  reset: (txnId: string) => void;
}

const CorrectionsContext = createContext<CorrectionsContextValue | null>(null);

/** Migrate the legacy flat `txnId -> categoryId` string map to the object shape. */
function normalize(parsed: unknown): Corrections {
  if (!parsed || typeof parsed !== "object") return {};
  const out: Corrections = {};
  for (const [txnId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string") out[txnId] = { categoryId: value };
    else if (value && typeof value === "object") {
      const v = value as Correction;
      const rec: Correction = {};
      if (typeof v.categoryId === "string") rec.categoryId = v.categoryId;
      if (v.hidden === true) rec.hidden = true;
      if (rec.categoryId !== undefined || rec.hidden) out[txnId] = rec;
    }
  }
  return out;
}

function read(): Corrections {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function write(next: Corrections): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

/** Apply a patch to one txn's record; drop the key when nothing is left. */
function patch(prev: Corrections, txnId: string, change: Partial<Correction>): Corrections {
  const merged: Correction = { ...prev[txnId], ...change };
  if (merged.hidden !== true) delete merged.hidden;
  if (merged.categoryId === undefined) delete merged.categoryId;
  const next = { ...prev };
  if (merged.categoryId === undefined && merged.hidden !== true) delete next[txnId];
  else next[txnId] = merged;
  write(next);
  return next;
}

export function CorrectionsProvider({ children }: { children: React.ReactNode }) {
  const [corrections, setCorrections] = useState<Corrections>({});

  useEffect(() => {
    setCorrections(read());
  }, []);

  const setCategory = useCallback((txnId: string, categoryId: string) => {
    setCorrections((prev) => patch(prev, txnId, { categoryId }));
  }, []);

  const setHidden = useCallback((txnId: string, hidden: boolean) => {
    setCorrections((prev) => patch(prev, txnId, { hidden }));
  }, []);

  const clearCategory = useCallback((txnId: string) => {
    setCorrections((prev) => patch(prev, txnId, { categoryId: undefined }));
  }, []);

  const reset = useCallback((txnId: string) => {
    setCorrections((prev) => {
      if (!prev[txnId]) return prev;
      const next = { ...prev };
      delete next[txnId];
      write(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ corrections, setCategory, setHidden, clearCategory, reset }),
    [corrections, setCategory, setHidden, clearCategory, reset],
  );
  return <CorrectionsContext.Provider value={value}>{children}</CorrectionsContext.Provider>;
}

export function useCorrections(): CorrectionsContextValue {
  const ctx = useContext(CorrectionsContext);
  if (!ctx) throw new Error("useCorrections must be used within <CorrectionsProvider>");
  return ctx;
}

/** Whether a transaction is hidden from spend/report totals. */
export function isHidden(corrections: Corrections, txnId: string): boolean {
  return corrections[txnId]?.hidden === true;
}

/**
 * Merge category corrections onto transactions (pure). Flags overridden rows
 * `userEdited`. Does NOT drop hidden rows — that exclusion is applied by the
 * caller (`useFinancials`) so the list can still show hidden rows while the
 * engine array excludes them.
 */
export function applyCorrections(txns: Transaction[], corrections: Corrections): Transaction[] {
  if (Object.keys(corrections).length === 0) return txns;
  return txns.map((t) => {
    const override = corrections[t.id]?.categoryId;
    return override && override !== t.categoryId ? { ...t, categoryId: override, userEdited: true } : t;
  });
}
