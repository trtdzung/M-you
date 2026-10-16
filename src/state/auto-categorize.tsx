"use client";

/**
 * Auto-categorization orchestration — mounted ONCE (Red Team #13) so the
 * in-flight guard and debounce are shared, not reset on every tab remount. It
 * decides WHEN to classify unclassified transactions and funnels the result
 * through the race-guarded overlay.
 *
 * Consent (Red Team #2, #9):
 *  - Sending merchant text out is gated on the "ai" scope. With "ai" granted we
 *    call the real LLM (GreenNode) via the same-origin proxy, tagged
 *    `origin:"ai"`. If that path is offline/unconfigured/errors, we degrade to
 *    the LOCAL heuristic (no text leaves the device), honestly tagged
 *    `origin:"heuristic"` — never mislabelled as "ai".
 *  - WITHOUT "ai" we run NO classifier at all — only the user's own memory is
 *    applied (purely local, learned from their confirmations). No new "guesses"
 *    appear when the user believes AI is off.
 *
 * Numbers never move here: it only sets category overlays; the engine recomputes
 * (invariant #1). Only already-unclassified txns with no assignment are touched
 * (invariant #6).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getConsent, hasScope, CONSENT_CHANGED_EVENT } from "@/lib/consent";
import { usePersona } from "@/providers/context";
import { isUnclassified } from "@/domain/categorize/unclassified";
import { categorize } from "@/ai/categorize/categorize-service";
import { localClassify } from "@/ai/categorize/local-classifier";
import { createRemoteClassify } from "@/ai/categorize/remote-classifier";
import { isAutoCategorizeEnabled } from "@/ai/categorize/config";
import { useFinancials } from "./useFinancials";
import { useCorrections } from "./corrections";
import { isUserOrigin, type Assignment, type Corrections } from "./corrections-core";
import { useCategoryMemory } from "./category-memory";
import { useAutoFundWith } from "./use-auto-fund";

/**
 * S7/I06/U4: the labels from a run that ACTUALLY change a txn's effective
 * category — `applied` (a `pending` guess never moves a number, invariant #6) and
 * not blocked by a user-authored record (the same race guard `mergeAssignments`
 * applies). These are the triggers whose jars must be reconciled.
 */
export function labelsToReconcile(assignments: Assignment[], corrections: Corrections): { txnId: string; categoryId: string }[] {
  return assignments
    .filter((a) => a.status === "applied" && !isUserOrigin(corrections[a.txnId]))
    .map((a) => ({ txnId: a.txnId, categoryId: a.categoryId }));
}

export interface CategorizeSummary {
  /** Applied straight from the user's memory (no model). */
  memoryApplied: number;
  /** Classifier suggestions auto-applied (confidence ≥ threshold). */
  applied: number;
  /** Classifier suggestions left pending (not counted until confirmed). */
  pending: number;
  /** Classifier chunks that failed (isolated — the rest still ran). */
  chunkErrors: number;
  /** True when the classifier was skipped for lack of "ai" consent. */
  skippedNoConsent: boolean;
  /** applied + pending — total suggestions produced this run. */
  suggested: number;
}

export type AutoCategorizeStatus = "loading" | "error" | "insufficient" | "empty" | "ready";

interface AutoCategorizeContextValue {
  /** On-demand run ("Gắn nhãn giúp tôi"); shares the in-flight guard with auto. */
  runNow: () => Promise<CategorizeSummary | undefined>;
  /** Summary of the most recent run (auto or on-demand), or null. */
  summary: CategorizeSummary | null;
  status: AutoCategorizeStatus;
  /** Unclassified txns with NO assignment yet (the backfill target). */
  todoCount: number;
  /** Txns still unclassified for the engine (incl. pending suggestions). */
  unclassifiedCount: number;
}

const AutoCategorizeContext = createContext<AutoCategorizeContextValue | null>(null);

export function AutoCategorizeProvider({ children }: { children: React.ReactNode }) {
  const { persona } = usePersona();
  const { allTransactions, transactions, raw, loading, error: dataError } = useFinancials();
  const { corrections, loaded, upsertAssignments } = useCorrections();
  const { memory, forget } = useCategoryMemory();
  // Reuses THIS provider's txn view (no second data fetch). Read through refs after
  // the async classify so the reconcile runs on the LATEST txns/corrections, not
  // the snapshot captured when the run started.
  const autoFund = useAutoFundWith({ transactions, raw });
  const autoFundRef = useRef(autoFund);
  autoFundRef.current = autoFund;
  const correctionsRef = useRef(corrections);
  correctionsRef.current = corrections;

  const [summary, setSummary] = useState<CategorizeSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(false);
  const inFlight = useRef(false);

  // Reactive "ai" consent (localStorage-backed; re-read on mount, persona switch,
  // cross-tab `storage`, AND the same-tab `CONSENT_CHANGED_EVENT` — the native
  // storage event never fires in the writing tab, so a mid-session grant/revoke
  // in Settings would otherwise stay stale until a full reload).
  const [aiConsent, setAiConsent] = useState(false);
  useEffect(() => {
    const read = () => setAiConsent(hasScope(getConsent(), "ai"));
    read();
    window.addEventListener("storage", read);
    window.addEventListener(CONSENT_CHANGED_EVENT, read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener(CONSENT_CHANGED_EVENT, read);
    };
  }, [persona.cif]);

  // Engine-unclassified txns (categoryId sentinel + AI-eligible type).
  const unclassified = useMemo(() => allTransactions.filter(isUnclassified), [allTransactions]);
  // Backfill target: unclassified AND no assignment/correction recorded yet.
  const todo = useMemo(
    () => unclassified.filter((t) => corrections[t.id]?.categoryId === undefined),
    [unclassified, corrections],
  );
  // Stable dependency: a sorted id string, so the auto effect fires on set
  // CHANGES, not on every array-identity change (Red Team #13/FMA8).
  const todoKey = useMemo(() => todo.map((t) => t.id).sort().join(","), [todo]);

  const run = useCallback(async (): Promise<CategorizeSummary | undefined> => {
    if (inFlight.current) return undefined;
    if (!isAutoCategorizeEnabled()) return undefined;
    if (todo.length === 0) return undefined;
    inFlight.current = true;
    setRunning(true);
    setRunError(false);
    try {
      // "ai" granted ⇒ real LLM (GreenNode) via the same-origin proxy, tagged
      // origin:"ai". WITHOUT consent ⇒ no classifier at all (memory-only) — no
      // merchant text leaves the device and no "guess" appears.
      const outcome = await categorize({
        txns: todo,
        memory,
        classify: aiConsent ? createRemoteClassify(persona.cif) : async () => [],
        classifyOrigin: "ai",
      });
      let { assignments, memoryApplied, applied, pending, chunkErrors } = outcome;
      const deadMemoryKeys = [...outcome.deadMemoryKeys];

      // Graceful degrade: if the AI path failed for any chunk (offline/no key/
      // upstream error → 501/502 → throw → chunkErrors), fill the still-unlabelled
      // txns with the LOCAL heuristic, honestly tagged origin:"heuristic".
      if (aiConsent && chunkErrors > 0) {
        const done = new Set(assignments.map((a) => a.txnId));
        const leftover = todo.filter((t) => !done.has(t.id));
        if (leftover.length > 0) {
          const fb = await categorize({
            txns: leftover,
            memory,
            classify: localClassify,
            classifyOrigin: "heuristic",
          });
          assignments = assignments.concat(fb.assignments);
          applied += fb.applied;
          pending += fb.pending;
          memoryApplied += fb.memoryApplied;
          deadMemoryKeys.push(...fb.deadMemoryKeys);
        }
      }

      // mergeAssignments (inside upsert) drops any txn the user has since
      // confirmed — the re-filter race guard (Red Team #6).
      const labels = labelsToReconcile(assignments, correctionsRef.current);
      upsertAssignments(assignments);
      // S7/I06/U4: the new labels can push jars over budget — fund them now, in ONE
      // batch (each fund sees the legs written before it → no double-funding).
      // A reconcile failure must not lose the labels themselves.
      if (labels.length > 0) {
        try {
          autoFundRef.current.reconcileLabels(labels);
        } catch (err) {
          console.error("Auto-fund after auto-categorize failed", err);
        }
      }
      deadMemoryKeys.forEach(forget);
      const next: CategorizeSummary = {
        memoryApplied,
        applied,
        pending,
        chunkErrors,
        skippedNoConsent: !aiConsent,
        suggested: applied + pending,
      };
      setSummary(next);
      return next;
    } catch {
      setRunError(true);
      return undefined;
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }, [todo, aiConsent, memory, upsertAssignments, forget, persona.cif]);

  // Auto-backfill: debounced, keyed on the stable todo string + consent.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    // Wait for the stored overlay: backfilling before it loads would re-label
    // (and re-send) txns the server already has labels for.
    if (loading || !loaded || todoKey === "") return;
    const timer = setTimeout(() => void runRef.current(), 500);
    return () => clearTimeout(timer);
  }, [todoKey, aiConsent, loading, loaded]);

  const status: AutoCategorizeStatus = running
    ? "loading"
    : runError || dataError
      ? "error"
      : !aiConsent && unclassified.length > 0
        ? "insufficient"
        : unclassified.length === 0
          ? "empty"
          : "ready";

  const value = useMemo<AutoCategorizeContextValue>(
    () => ({ runNow: run, summary, status, todoCount: todo.length, unclassifiedCount: unclassified.length }),
    [run, summary, status, todo.length, unclassified.length],
  );
  return <AutoCategorizeContext.Provider value={value}>{children}</AutoCategorizeContext.Provider>;
}

export function useAutoCategorize(): AutoCategorizeContextValue {
  const ctx = useContext(AutoCategorizeContext);
  if (!ctx) throw new Error("useAutoCategorize must be used within <AutoCategorizeProvider>");
  return ctx;
}
