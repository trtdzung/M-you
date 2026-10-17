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
 * result that belongs to a previous persona. Both live in
 * `./serial-request-queue` so the category provider runs on the SAME machinery.
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
import { useSerialRequestQueue } from "./serial-request-queue";

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
  /**
   * Opaque marker of the config currently held: capture it BEFORE issuing a write
   * on another resource and hand it back to `applyServerConfig` below. Two configs
   * carry no version we could compare, so this counter is the only "newer" test.
   */
  configToken: () => number;
  /**
   * Apply a `JarConfig` returned by a write on ANOTHER resource — a category
   * create/delete re-homes categories, so `/api/categories*` answers with the
   * whole aggregate. It runs through the SAME serial queue and the SAME persona
   * guard as a jar write, so a second copy of the jar config can never be painted
   * on out of band (that is how a category ends up in two hũ client-side and
   * `evaluateJarBudget` double-counts its spend — Σ-conservation, invariant #6).
   *
   * `since` is the `configToken()` taken when the other write was ISSUED. If any
   * jar response has been applied since then, that one is newer and this copy is
   * DROPPED rather than clobbering it. Resolves once the decision is made.
   */
  applyServerConfig: (config: JarConfig, since?: number) => Promise<void>;
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
  const { enqueue, generation, newGeneration } = useSerialRequestQueue();
  /**
   * Bumped every time a server config is applied — the counter behind
   * `configToken`, so a config handed over by a category write can never overwrite
   * a jar response that landed after it was fetched.
   */
  const revRef = useRef(0);

  /** The ONE place a server config reaches state (so `revRef` can never drift). */
  const applyConfig = useCallback((next: JarConfig) => {
    revRef.current += 1;
    setConfig(next);
  }, []);

  // Load on mount, persona switch and retry. Reset to empty FIRST, synchronously
  // — otherwise the previous persona's jars stay on screen until the new fetch
  // resolves (H5).
  useEffect(() => {
    const gen = newGeneration();
    applyConfig(EMPTY_CONFIG);
    setLoaded(false);
    setError(null);
    setMutationError(null);
    enqueue(() => providers.getJarConfig()).then(
      (next) => {
        if (gen !== generation()) return;
        applyConfig(next);
        setLoaded(true);
      },
      (err: unknown) => {
        console.error("Failed to load jar config", err);
        if (gen === generation()) setError(JAR_LOAD_ERROR);
      },
    );
    return () => void newGeneration();
  }, [providers, reloadKey, enqueue, generation, newGeneration, applyConfig]);

  /** Run one config write in order; apply its response only for the live persona. */
  const mutate = useCallback(
    (op: (p: Providers) => Promise<JarConfig>, surface = true): Promise<boolean> => {
      const gen = generation();
      return enqueue(() => op(providers)).then(
        (next) => {
          if (gen !== generation()) return false; // K03: previous persona's response
          applyConfig(next);
          if (surface) setMutationError(null);
          return true;
        },
        (err: unknown) => {
          console.error("Jar mutation failed", err);
          if (gen === generation() && surface) setMutationError(jarMutationErrorMessage(err));
          return false;
        },
      );
    },
    [enqueue, generation, providers, applyConfig],
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
        const gen = generation();
        return enqueue(() => providers.updateJars(patches)).then((next) => {
          if (gen === generation()) applyConfig(next);
        });
      },
      removeJar: (id) => mutate((p) => p.removeJar(id)),
      assignCategory: (categoryId, jarId) =>
        jarId === null ? Promise.resolve(false) : mutate((p) => p.assignCategory(categoryId, jarId)),
      applyTemplate: (templateId) => mutate((p) => p.replaceJars(JAR_TEMPLATES[templateId].jars)),
      resetToSeed: () => mutate((p) => p.replaceJars(DEFAULT_JAR_CONFIG.jars)),
      configToken: () => revRef.current,
      applyServerConfig: (next, since) => {
        const gen = generation();
        const rev = since ?? revRef.current;
        return enqueue(() => Promise.resolve(next)).then((cfg) => {
          // Stale in two ways: a different persona (K03), or a jar response that
          // landed after this config was fetched — that one is newer truth.
          if (gen !== generation() || rev !== revRef.current) return;
          applyConfig(cfg);
        });
      },
    }),
    [config, loaded, error, mutationError, mutate, enqueue, generation, providers, applyConfig],
  );

  return <JarConfigContext.Provider value={value}>{children}</JarConfigContext.Provider>;
}

export function useJarConfig(): JarConfigContextValue {
  const ctx = useContext(JarConfigContext);
  if (!ctx) throw new Error("useJarConfig must be used within <JarConfigProvider>");
  return ctx;
}
