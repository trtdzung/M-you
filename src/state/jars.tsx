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
 * refused write.
 *
 * Balances (plan 260923): a jar's SỐ DƯ is derived by the engine from the stored
 * ledger (invariant #1). `postLedger` is the ONE balance mutator — deposits and
 * withdrawals go through `POST /api/jar-ledger` as one atomic batch on the same
 * queue + persona guard as every other jar write (a display partition of CASA,
 * never money movement — invariant #3).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Jar, JarConfig } from "@/domain/models";
import { jarsLosingBalance } from "@/domain/jar-rules";
import { DEFAULT_JAR_CONFIG, JAR_TEMPLATES } from "@/domain/models/jar-defaults";
import { useProviders } from "@/providers/context";
import type { Providers } from "@/providers";
import { balanceLossPrompt, JAR_LOAD_ERROR, jarMutationErrorMessage } from "./jars-error-message";
import { useSerialRequestQueue } from "./serial-request-queue";
import type { JarConfigContextValue, ReplaceJarsOptions } from "./jar-config-types";

export type { JarConfigContextValue, ReplaceJarsOptions } from "./jar-config-types";

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

  /** Template apply / restore defaults, guarded against an unconfirmed balance loss. */
  const replaceGuarded = useCallback(
    (nextJars: Jar[], opts?: ReplaceJarsOptions): Promise<boolean> => {
      const losing = jarsLosingBalance(config, nextJars);
      if (losing.length > 0 && !opts?.confirmedBalanceLoss) {
        const labels = losing.map((id) => config.jars.find((j) => j.id === id)?.label ?? id);
        setMutationError(balanceLossPrompt(labels));
        return Promise.resolve(false);
      }
      return mutate((p) => p.replaceJars(nextJars));
    },
    [config, mutate],
  );

  const value = useMemo<JarConfigContextValue>(
    () => ({
      config,
      loaded,
      error,
      retry: () => setReloadKey((k) => k + 1),
      mutationError,
      clearMutationError: () => setMutationError(null),
      addJar: (jar, balance) => mutate((p) => p.createJar(jar, balance)),
      updateJar: (id, patch) => mutate((p) => p.updateJar(id, patch)),
      postLedger: (entries) => mutate((p) => p.postJarLedger(entries)),
      removeJar: (id) => mutate((p) => p.removeJar(id)),
      assignCategory: (categoryId, jarId) =>
        jarId === null ? Promise.resolve(false) : mutate((p) => p.assignCategory(categoryId, jarId)),
      applyTemplate: (templateId, opts) => replaceGuarded(JAR_TEMPLATES[templateId].jars, opts),
      resetToSeed: (opts) => replaceGuarded(DEFAULT_JAR_CONFIG.jars, opts),
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
    [config, loaded, error, mutationError, mutate, replaceGuarded, enqueue, generation, applyConfig],
  );

  return <JarConfigContext.Provider value={value}>{children}</JarConfigContext.Provider>;
}

export function useJarConfig(): JarConfigContextValue {
  const ctx = useContext(JarConfigContext);
  if (!ctx) throw new Error("useJarConfig must be used within <JarConfigProvider>");
  return ctx;
}
