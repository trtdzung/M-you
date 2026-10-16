"use client";

/**
 * Spending-jar configuration state. A thin client over `/api/jars*`
 * (SQLite-backed, see `data/jars/schema.md`) — every business invariant
 * (one-category-one-jar, CASA cap) is enforced SERVER-SIDE (`src/domain/jar-rules.ts`,
 * used by the route handlers); this provider calls the matching endpoint and
 * stores whatever `JarConfig` comes back. Loads on mount, on persona switch
 * (provider identity change) and on `retry()`.
 *
 * Ordering (U13/K04): the load and every mutation run through ONE serial queue,
 * so requests reach the server in click order and responses are applied in that
 * same order — the final UI and DB both equal the LAST click, never whichever
 * response happened to arrive last. A persona generation guard (K03) drops any
 * result that belongs to a previous persona.
 *
 * Failures are surfaced, never swallowed (U10/U20): `error` for the initial
 * load, `mutationError` (Vietnamese, server reason kept — e.g. over-cap) for a
 * refused write. A jar has NO stored balance (spendable is derived from txn
 * history, invariant #1), so there is no balance mutator here.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Jar, JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG, JAR_TEMPLATES, type JarTemplate } from "@/domain/models/jar-defaults";
import { useProviders } from "@/providers/context";
import type { Providers } from "@/providers";
import { JAR_LOAD_ERROR, jarMutationErrorMessage } from "./jars-error-message";

type JarPatch = Partial<Omit<Jar, "id">>;

export interface JarConfigContextValue {
  config: JarConfig;
  /**
   * False until the first fetch for the current persona resolves. The transfer
   * flow must not compute the unallocated pool or classify "insufficient" while
   * jars are still empty-by-loading (would misread `jars: []` — RT#14).
   */
  loaded: boolean;
  /** Non-null (VN copy) when the load for the current persona failed; reset on persona switch/retry. */
  error: string | null;
  /** Re-run the load for the current persona (clears `error`). */
  retry: () => void;
  /** VN reason of the latest failed write (incl. the server's 422 over-cap); null once a write succeeds. */
  mutationError: string | null;
  clearMutationError: () => void;
  /** Mutators resolve `true` when the write was applied, `false` when it failed (see `mutationError`). */
  addJar: (jar: Jar) => Promise<boolean>;
  updateJar: (id: string, patch: JarPatch) => Promise<boolean>;
  /**
   * Patch several jars in ONE atomic write ("Chia ngay"). REJECTS on failure so
   * the caller (AllocationSheet) keeps its draft and shows its own error — it
   * does not set `mutationError`.
   */
  updateJars: (patches: Record<string, JarPatch>) => Promise<void>;
  /** Remove a jar; its categories move to "Khác" and its rebalance legs are deleted server-side. */
  removeJar: (id: string) => Promise<boolean>;
  /** Move a category into `jarId`. `jarId === null` is a no-op (exactly-one). */
  assignCategory: (categoryId: string, jarId: string | null) => Promise<boolean>;
  /** REPLACE the whole jar set with a template's (confirm-on-replace in UI). */
  applyTemplate: (templateId: JarTemplate["id"]) => Promise<boolean>;
  resetToSeed: () => Promise<boolean>;
}

const EMPTY_CONFIG: JarConfig = { version: 3, jars: [] };

const JarConfigContext = createContext<JarConfigContextValue | null>(null);

export function JarConfigProvider({ children }: { children: React.ReactNode }) {
  const providers = useProviders();
  const [config, setConfig] = useState<JarConfig>(EMPTY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** Bumped on persona switch / retry / unmount: results of an older generation are dropped. */
  const genRef = useRef(0);
  /** Tail of the serial request queue (never rejects). */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  /** Append `op` to the serial queue; resolves/rejects with `op`'s own result. */
  const enqueue = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    const task = queueRef.current.then(op);
    queueRef.current = task.catch(() => undefined);
    return task;
  }, []);

  // Load on mount, persona switch and retry. Reset to empty FIRST, synchronously
  // — otherwise the previous persona's jars stay on screen until the new fetch
  // resolves (H5). A new generation starts a fresh queue: the new persona's load
  // never waits behind the old persona's writes.
  useEffect(() => {
    const gen = ++genRef.current;
    queueRef.current = Promise.resolve();
    setConfig(EMPTY_CONFIG);
    setLoaded(false);
    setError(null);
    setMutationError(null);
    enqueue(() => providers.getJarConfig()).then(
      (next) => {
        if (gen !== genRef.current) return;
        setConfig(next);
        setLoaded(true);
      },
      (err: unknown) => {
        console.error("Failed to load jar config", err);
        if (gen === genRef.current) setError(JAR_LOAD_ERROR);
      },
    );
    return () => {
      genRef.current += 1;
    };
  }, [providers, reloadKey, enqueue]);

  /** Run one config write in order; apply its response only for the live persona. */
  const mutate = useCallback(
    (op: (p: Providers) => Promise<JarConfig>, surface = true): Promise<boolean> => {
      const gen = genRef.current;
      return enqueue(() => op(providers)).then(
        (next) => {
          if (gen !== genRef.current) return false; // K03: previous persona's response
          setConfig(next);
          if (surface) setMutationError(null);
          return true;
        },
        (err: unknown) => {
          console.error("Jar mutation failed", err);
          if (gen === genRef.current && surface) setMutationError(jarMutationErrorMessage(err));
          return false;
        },
      );
    },
    [enqueue, providers],
  );

  const value = useMemo<JarConfigContextValue>(
    () => ({
      config,
      loaded,
      error,
      retry: () => setReloadKey((k) => k + 1),
      mutationError,
      clearMutationError: () => setMutationError(null),
      addJar: (jar) => mutate((p) => p.createJar(jar)),
      updateJar: (id, patch) => mutate((p) => p.updateJar(id, patch)),
      updateJars: (patches) => {
        // Same queue + persona guard, but the rejection is handed to the caller.
        const gen = genRef.current;
        return enqueue(() => providers.updateJars(patches)).then((next) => {
          if (gen === genRef.current) setConfig(next);
        });
      },
      removeJar: (id) => mutate((p) => p.removeJar(id)),
      assignCategory: (categoryId, jarId) =>
        jarId === null ? Promise.resolve(false) : mutate((p) => p.assignCategory(categoryId, jarId)),
      applyTemplate: (templateId) => mutate((p) => p.replaceJars(JAR_TEMPLATES[templateId].jars)),
      resetToSeed: () => mutate((p) => p.replaceJars(DEFAULT_JAR_CONFIG.jars)),
    }),
    [config, loaded, error, mutationError, mutate, enqueue, providers],
  );

  return <JarConfigContext.Provider value={value}>{children}</JarConfigContext.Provider>;
}

export function useJarConfig(): JarConfigContextValue {
  const ctx = useContext(JarConfigContext);
  if (!ctx) throw new Error("useJarConfig must be used within <JarConfigProvider>");
  return ctx;
}
