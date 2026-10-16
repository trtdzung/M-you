"use client";

/**
 * In-session transaction corrections — a separate overlay, never a mutation of
 * provider data (invariant #4). It is the SINGLE txn-keyed overlay (Red Team #7)
 * and carries three kinds of record:
 *  - a user `categoryId` correction (origin "user", always wins);
 *  - an AI/memory/heuristic assignment (origin non-"user", may be `pending`);
 *  - a `hidden` flag excluding a txn from spend/report totals (row stays visible).
 *
 * Pure logic (migration, resolution, race guard) lives in `corrections-core.ts`.
 * This module owns persistence: per-persona storage, one-time legacy migration,
 * cross-tab sync, and honest write-failure signalling (Red Team #11/#12/#13).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Transaction } from "@/domain/models";
import { usePersona } from "@/providers/context";
import { useCategoryMemory } from "./category-memory";
import {
  type Assignment,
  type Correction,
  type Corrections,
  applyCorrections,
  isHidden,
  mergeAssignments,
  normalize,
  patch,
  promoteToUser as promoteCore,
} from "./corrections-core";

export type { Assignment, Correction, CorrectionOrigin, Corrections } from "./corrections-core";
export { applyCorrections, isHidden, resolveEffective } from "./corrections-core";

const STORAGE_PREFIX = "msb-pfm.corrections";
/** Pre-per-cif flat key — migrated into the active persona once, then removed. */
const LEGACY_FLAT_KEY = "msb-pfm.corrections";

interface CorrectionsContextValue {
  corrections: Corrections;
  setCategory: (txnId: string, categoryId: string) => void;
  setHidden: (txnId: string, hidden: boolean) => void;
  clearCategory: (txnId: string) => void;
  reset: (txnId: string) => void;
  /** Merge classify-pipeline assignments (race-guarded; user records survive). */
  upsertAssignments: (assignments: Assignment[]) => void;
  /** Confirm a category as a user correction (accept/correct). */
  promoteToUser: (txnId: string, categoryId: string) => void;
  /** True when the last write to localStorage failed (quota/private mode). */
  unsaved: boolean;
}

const CorrectionsContext = createContext<CorrectionsContextValue | null>(null);

function keyFor(cif: string): string {
  return `${STORAGE_PREFIX}.${cif}`;
}

function readKey(key: string): Corrections {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Write, returning success — a false result tells the UI the change is unsaved. */
function writeKey(key: string, next: Corrections): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/**
 * One-time migration of the legacy flat key into a persona's key. The legacy
 * store was shared across every persona (a latent leak); we fold it into the
 * active persona once and delete it so it cannot re-apply elsewhere.
 */
function migrateLegacy(cif: string): void {
  if (typeof window === "undefined") return;
  if (keyFor(cif) === LEGACY_FLAT_KEY) return; // never happens (prefix has a dot), defensive
  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_FLAT_KEY);
    if (!legacyRaw) return;
    const legacy = normalize(JSON.parse(legacyRaw));
    if (Object.keys(legacy).length > 0) {
      const current = readKey(keyFor(cif));
      // Existing per-cif records win over legacy on a key clash.
      writeKey(keyFor(cif), { ...legacy, ...current });
    }
    window.localStorage.removeItem(LEGACY_FLAT_KEY);
  } catch {
    // ignore migration failures — legacy data simply stays untouched
  }
}

export function CorrectionsProvider({ children }: { children: React.ReactNode }) {
  const { persona } = usePersona();
  const key = keyFor(persona.cif);
  const [corrections, setCorrections] = useState<Corrections>({});
  const [unsaved, setUnsaved] = useState(false);
  // Mirror so read-merge-write can base off the freshest value synchronously.
  const keyRef = useRef(key);
  keyRef.current = key;

  // Load on mount and whenever the persona (storage key) changes. Reset to {}
  // FIRST so the previous persona's overlay never lingers while the new key loads.
  useEffect(() => {
    setCorrections({});
    setUnsaved(false);
    migrateLegacy(persona.cif);
    setCorrections(readKey(key));
  }, [key, persona.cif]);

  // Cross-tab sync: rehydrate from storage when THIS key changes in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyRef.current) setCorrections(readKey(keyRef.current));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /**
   * Read-merge-write: re-read localStorage right before writing so a concurrent
   * write from another tab is merged in, not blindly overwritten (Red Team #11).
   * `merge` receives the freshest persisted state and returns the next state.
   */
  const commit = useCallback((merge: (fresh: Corrections) => Corrections) => {
    const k = keyRef.current;
    setCorrections((inMemory) => {
      const fresh = readKey(k);
      // Prefer the freshest persisted view, but keep any in-memory keys not yet
      // flushed (e.g. a prior failed write) so nothing silently regresses.
      const base: Corrections = { ...inMemory, ...fresh };
      const next = merge(base);
      const ok = writeKey(k, next);
      setUnsaved(!ok);
      return next;
    });
  }, []);

  const setCategory = useCallback(
    (txnId: string, categoryId: string) => commit((c) => patch(c, txnId, { categoryId, origin: "user", status: "applied" })),
    [commit],
  );
  const setHidden = useCallback((txnId: string, hidden: boolean) => commit((c) => patch(c, txnId, { hidden })), [commit]);
  const clearCategory = useCallback((txnId: string) => commit((c) => patch(c, txnId, { categoryId: undefined })), [commit]);
  const reset = useCallback(
    (txnId: string) =>
      commit((c) => {
        if (!c[txnId]) return c;
        const next = { ...c };
        delete next[txnId];
        return next;
      }),
    [commit],
  );
  const upsertAssignments = useCallback(
    (assignments: Assignment[]) => commit((c) => mergeAssignments(c, assignments)),
    [commit],
  );
  const promoteToUser = useCallback(
    (txnId: string, categoryId: string) => commit((c) => promoteCore(c, txnId, categoryId)),
    [commit],
  );

  const value = useMemo(
    () => ({ corrections, setCategory, setHidden, clearCategory, reset, upsertAssignments, promoteToUser, unsaved }),
    [corrections, setCategory, setHidden, clearCategory, reset, upsertAssignments, promoteToUser, unsaved],
  );
  return <CorrectionsContext.Provider value={value}>{children}</CorrectionsContext.Provider>;
}

export function useCorrections(): CorrectionsContextValue {
  const ctx = useContext(CorrectionsContext);
  if (!ctx) throw new Error("useCorrections must be used within <CorrectionsProvider>");
  return ctx;
}

/**
 * The single shared accept/correct action (Red Team #15): promote the category
 * to a user correction AND teach the per-persona memory (validated in phase-02).
 * Every accept/correct button funnels through here so learning can never diverge
 * or be applied from a non-user source (Red Team #3).
 */
export function useConfirmCategory(): (txn: Transaction, categoryId: string) => void {
  const { promoteToUser } = useCorrections();
  const { remember } = useCategoryMemory();
  return useCallback(
    (txn: Transaction, categoryId: string) => {
      promoteToUser(txn.id, categoryId);
      remember(txn.merchantNormalizedName || txn.merchantName, categoryId);
    },
    [promoteToUser, remember],
  );
}
