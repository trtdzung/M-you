"use client";

/**
 * In-session category corrections. When a user re-categorizes a transaction the
 * override is stored here (context + localStorage) and merged onto provider
 * transactions before any engine call, so cash flow and budgets recompute. We
 * never mutate provider data — corrections are a separate overlay.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/domain/models";

const STORAGE_KEY = "msb-pfm.corrections";

export type Corrections = Record<string, string>; // txnId -> categoryId

interface CorrectionsContextValue {
  corrections: Corrections;
  setCategory: (txnId: string, categoryId: string) => void;
  reset: (txnId: string) => void;
}

const CorrectionsContext = createContext<CorrectionsContextValue | null>(null);

function read(): Corrections {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Corrections) : {};
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

export function CorrectionsProvider({ children }: { children: React.ReactNode }) {
  const [corrections, setCorrections] = useState<Corrections>({});

  useEffect(() => {
    setCorrections(read());
  }, []);

  const setCategory = useCallback((txnId: string, categoryId: string) => {
    setCorrections((prev) => {
      const next = { ...prev, [txnId]: categoryId };
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback((txnId: string) => {
    setCorrections((prev) => {
      const next = { ...prev };
      delete next[txnId];
      write(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ corrections, setCategory, reset }), [corrections, setCategory, reset]);
  return <CorrectionsContext.Provider value={value}>{children}</CorrectionsContext.Provider>;
}

export function useCorrections(): CorrectionsContextValue {
  const ctx = useContext(CorrectionsContext);
  if (!ctx) throw new Error("useCorrections must be used within <CorrectionsProvider>");
  return ctx;
}

/** Merge corrections onto transactions (pure). Flags overridden rows userEdited. */
export function applyCorrections(txns: Transaction[], corrections: Corrections): Transaction[] {
  if (Object.keys(corrections).length === 0) return txns;
  return txns.map((t) => {
    const override = corrections[t.id];
    return override && override !== t.categoryId ? { ...t, categoryId: override, userEdited: true } : t;
  });
}
