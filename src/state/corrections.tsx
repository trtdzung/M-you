"use client";

/**
 * Transaction corrections — a separate overlay, never a mutation of provider
 * data (invariant #4). It is the SINGLE txn-keyed overlay (Red Team #7) and
 * carries three kinds of record:
 *  - a user `categoryId` correction (origin "user", always wins);
 *  - an AI/memory/heuristic assignment (origin non-"user", may be `pending`);
 *  - a `hidden` flag excluding a txn from spend/report totals (row stays visible).
 *
 * Pure logic (migration, resolution, race guard) lives in `corrections-core.ts`.
 * This module owns persistence: the overlay is stored server-side in SQLite via
 * `/api/corrections` (per persona), so labels survive reloads and devices. State
 * updates optimistically; each change is sent as a per-txn diff through an
 * ordered queue, and a failed write raises `unsaved` (Red Team #12). Labels left
 * in browser localStorage by the earlier version are migrated up once.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Transaction } from "@/domain/models";
import { usePersona } from "@/providers/context";
import { useCategoryMemory } from "./category-memory";
import {
  type Assignment,
  type Correction,
  type Corrections,
  mergeAssignments,
  normalize,
  patch,
  promoteToUser as promoteCore,
} from "./corrections-core";

export type { Assignment, Correction, CorrectionOrigin, Corrections } from "./corrections-core";
export { applyCorrections, isHidden, resolveEffective } from "./corrections-core";

/** localStorage keys of the pre-DB version — read once for migration, then removed. */
const LOCAL_PREFIX = "msb-pfm.corrections";
const LEGACY_FLAT_KEY = "msb-pfm.corrections";

type Changes = Record<string, Correction | null>;

interface CorrectionsContextValue {
  corrections: Corrections;
  /** True once the persona's stored overlay has loaded from the server. */
  loaded: boolean;
  setCategory: (txnId: string, categoryId: string) => void;
  setHidden: (txnId: string, hidden: boolean) => void;
  clearCategory: (txnId: string) => void;
  reset: (txnId: string) => void;
  /** Merge classify-pipeline assignments (race-guarded; user records survive). */
  upsertAssignments: (assignments: Assignment[]) => void;
  /** Confirm a category as a user correction (accept/correct). */
  promoteToUser: (txnId: string, categoryId: string) => void;
  /** True when the last write to the server failed. */
  unsaved: boolean;
}

const CorrectionsContext = createContext<CorrectionsContextValue | null>(null);

async function fetchCorrections(cif: string): Promise<Corrections> {
  const res = await fetch(`/api/corrections?cif=${encodeURIComponent(cif)}`);
  if (!res.ok) throw new Error(`corrections load failed: ${res.status}`);
  return normalize(await res.json());
}

async function sendChanges(cif: string, changes: Changes): Promise<boolean> {
  try {
    const res = await fetch("/api/corrections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cif, changes }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Per-txn diff between two overlays: changed/added records, `null` for removed. */
function diff(prev: Corrections, next: Corrections): Changes {
  const out: Changes = {};
  for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (!(id in next)) out[id] = null;
    else if (JSON.stringify(prev[id]) !== JSON.stringify(next[id])) out[id] = next[id];
  }
  return out;
}

/** Labels the pre-DB version kept in localStorage for this persona (+ the legacy flat key). */
function readLocal(cif: string): Corrections {
  try {
    const parse = (key: string) => {
      const raw = window.localStorage.getItem(key);
      return raw ? normalize(JSON.parse(raw)) : {};
    };
    return { ...parse(LEGACY_FLAT_KEY), ...parse(`${LOCAL_PREFIX}.${cif}`) };
  } catch {
    return {};
  }
}

function clearLocal(cif: string): void {
  try {
    window.localStorage.removeItem(LEGACY_FLAT_KEY);
    window.localStorage.removeItem(`${LOCAL_PREFIX}.${cif}`);
  } catch {
    // storage unavailable — nothing to clear
  }
}

export function CorrectionsProvider({ children }: { children: React.ReactNode }) {
  const { persona } = usePersona();
  const cif = persona.cif;
  const [corrections, setCorrections] = useState<Corrections>({});
  const [loaded, setLoaded] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const stateRef = useRef<Corrections>({});
  const cifRef = useRef(cif);
  cifRef.current = cif;
  // Writes go out one at a time, in commit order, so a slow earlier PATCH can
  // never land after (and undo) a later one.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const send = useCallback((forCif: string, changes: Changes) => {
    if (Object.keys(changes).length === 0) return;
    queue.current = queue.current.then(async () => {
      const ok = await sendChanges(forCif, changes);
      if (cifRef.current === forCif) setUnsaved(!ok);
    });
  }, []);

  // Load on mount and on persona switch. Reset FIRST so the previous persona's
  // overlay never lingers while the new one loads.
  useEffect(() => {
    let active = true;
    stateRef.current = {};
    setCorrections({});
    setLoaded(false);
    setUnsaved(false);
    fetchCorrections(cif)
      .then((stored) => {
        if (!active) return;
        // One-time migration: local labels the server doesn't have yet go up;
        // a record already on the server wins on a clash.
        const local = readLocal(cif);
        const missing: Changes = {};
        for (const [id, rec] of Object.entries(local)) if (!(id in stored)) missing[id] = rec;
        const merged = { ...missing, ...stored } as Corrections;
        stateRef.current = merged;
        setCorrections(merged);
        setLoaded(true);
        if (Object.keys(missing).length === 0) {
          clearLocal(cif);
          return;
        }
        queue.current = queue.current.then(async () => {
          const ok = await sendChanges(cif, missing);
          if (ok) clearLocal(cif); // keep the local copy until the server has it
          if (active) setUnsaved(!ok);
        });
      })
      .catch(() => {
        // Load failed: stay not-`loaded` (auto-categorize waits); user edits still
        // go out as per-txn diffs, so nothing stored on the server is overwritten.
      });
    return () => {
      active = false;
    };
  }, [cif]);

  /** Apply a change optimistically, then persist exactly what changed. */
  const commit = useCallback(
    (merge: (current: Corrections) => Corrections) => {
      const prev = stateRef.current;
      const next = merge(prev);
      if (next === prev) return;
      stateRef.current = next;
      setCorrections(next);
      send(cifRef.current, diff(prev, next));
    },
    [send],
  );

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
    () => ({ corrections, loaded, setCategory, setHidden, clearCategory, reset, upsertAssignments, promoteToUser, unsaved }),
    [corrections, loaded, setCategory, setHidden, clearCategory, reset, upsertAssignments, promoteToUser, unsaved],
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
