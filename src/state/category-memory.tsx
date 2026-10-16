"use client";

/**
 * Per-persona category memory (learning): `normalizedMerchant -> categoryId`.
 * It is a DETERMINISTIC cache placed BEFORE the LLM (a merchant the user has
 * already labelled is auto-applied with no model call) and the concrete form of
 * the "learn from corrections" behaviour docs/PRODUCT.md promises.
 *
 * Trust rules (Red Team #3, #5):
 *  - Only a real user action (accept/correct, via `remember`) ever writes here —
 *    never LLM/heuristic output. `forget` is always available to undo a bad map.
 *  - Every id is validated against the taxonomy on BOTH write and read; a value
 *    that is not a real spending category (incl. the UNCLASSIFIED sentinel) is
 *    never stored and never returned (a dead id ⇒ miss, so the txn re-classifies).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePersona } from "@/providers/context";
import { CATEGORY_BY_ID, UNCLASSIFIED } from "@/domain/models";

export interface MemoryEntry {
  categoryId: string;
  updatedAt: number;
  hits: number;
}
export type CategoryMemory = Record<string, MemoryEntry>; // normalizedMerchant -> entry

const STORAGE_PREFIX = "msb-pfm.category-memory";

/** Stable merchant key: lowercase, trimmed, whitespace collapsed. No NLP (KISS). */
export function normalizeMerchantKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** A categoryId is memorable only when it is a real spending category. */
export function isMemorableCategory(categoryId: string): boolean {
  return categoryId !== UNCLASSIFIED && CATEGORY_BY_ID[categoryId] !== undefined;
}

/**
 * Look a merchant up in a memory snapshot (pure). Returns the mapped category
 * only when it is still valid; a dead id (taxonomy changed) is treated as a miss
 * so the caller re-classifies. `deadKey` reports a stale entry worth forgetting.
 */
export function lookupMemory(
  memory: CategoryMemory,
  merchant: string,
): { categoryId?: string; deadKey?: string } {
  const key = normalizeMerchantKey(merchant);
  const entry = memory[key];
  if (!entry) return {};
  if (!isMemorableCategory(entry.categoryId)) return { deadKey: key };
  return { categoryId: entry.categoryId };
}

interface CategoryMemoryContextValue {
  memory: CategoryMemory;
  /** Teach the map from a user action. No-op for a non-memorable category. */
  remember: (merchant: string, categoryId: string) => void;
  /** Resolve a merchant to a valid category, or `undefined` (a dead id is pruned). */
  lookup: (merchant: string) => string | undefined;
  /** Drop a mapping (undo a poisoned/wrong learn, or prune a dead id). */
  forget: (merchant: string) => void;
}

const CategoryMemoryContext = createContext<CategoryMemoryContextValue | null>(null);

function keyFor(cif: string): string {
  return `${STORAGE_PREFIX}.${cif}`;
}

function isMemory(v: unknown): v is CategoryMemory {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function readKey(key: string): CategoryMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isMemory(parsed) ? (parsed as CategoryMemory) : {};
  } catch {
    return {};
  }
}

function writeKey(key: string, next: CategoryMemory): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore storage errors — memory is a best-effort cache
  }
}

export function CategoryMemoryProvider({ children }: { children: React.ReactNode }) {
  const { persona } = usePersona();
  const key = keyFor(persona.cif);
  const [memory, setMemory] = useState<CategoryMemory>({});
  const keyRef = useRef(key);
  keyRef.current = key;

  // Reset-before-load on persona switch (no leak across personas).
  useEffect(() => {
    setMemory({});
    setMemory(readKey(key));
  }, [key]);

  // Cross-tab sync for the active key.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyRef.current) setMemory(readKey(keyRef.current));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((merge: (fresh: CategoryMemory) => CategoryMemory) => {
    const k = keyRef.current;
    setMemory((inMemory) => {
      const fresh = { ...inMemory, ...readKey(k) };
      const next = merge(fresh);
      writeKey(k, next);
      return next;
    });
  }, []);

  const remember = useCallback(
    (merchant: string, categoryId: string) => {
      if (!isMemorableCategory(categoryId)) return; // validate on write (Red Team #5)
      const mk = normalizeMerchantKey(merchant);
      if (!mk) return;
      commit((m) => {
        const prev = m[mk];
        return {
          ...m,
          [mk]: {
            categoryId,
            updatedAt: Date.now(),
            hits: (prev?.categoryId === categoryId ? prev.hits : 0) + 1,
          },
        };
      });
    },
    [commit],
  );

  const forget = useCallback(
    (merchant: string) => {
      const mk = normalizeMerchantKey(merchant);
      commit((m) => {
        if (!m[mk]) return m;
        const next = { ...m };
        delete next[mk];
        return next;
      });
    },
    [commit],
  );

  const lookup = useCallback(
    (merchant: string): string | undefined => {
      const { categoryId, deadKey } = lookupMemory(memory, merchant);
      if (deadKey) forget(deadKey);
      return categoryId;
    },
    [memory, forget],
  );

  const value = useMemo(
    () => ({ memory, remember, lookup, forget }),
    [memory, remember, lookup, forget],
  );
  return <CategoryMemoryContext.Provider value={value}>{children}</CategoryMemoryContext.Provider>;
}

export function useCategoryMemory(): CategoryMemoryContextValue {
  const ctx = useContext(CategoryMemoryContext);
  if (!ctx) throw new Error("useCategoryMemory must be used within <CategoryMemoryProvider>");
  return ctx;
}
