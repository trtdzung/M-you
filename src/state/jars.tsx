"use client";

/**
 * Spending-jar configuration state. Loads the user's jars via the provider seam
 * (persona-scoped) on mount and whenever the persona changes, seeding a default
 * template when none is stored; every mutation persists back through the same
 * provider. Config is USER STATE — threaded into the engine, never a fixture.
 *
 * The one-category-one-jar invariant is enforced here (a category is stripped
 * from any other jar before it joins a new one) so the engine never double-
 * counts a category's spend.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Jar, JarAllocation, JarConfig } from "@/domain/models";
import {
  configFromTemplate,
  DEFAULT_JAR_CONFIG,
  JAR_TEMPLATES,
  type JarTemplate,
} from "@/domain/models/jar-defaults";
import { useProviders } from "@/providers/context";

/** Fresh, deep copy of the seed so callers never share a mutable reference. */
function seed(): JarConfig {
  return JSON.parse(JSON.stringify(DEFAULT_JAR_CONFIG)) as JarConfig;
}

/**
 * Migrate a loaded config to v2. Model A dropped anchor + income basis, so a
 * stored v1 is structurally incompatible — the migration DISCARDS it and reseeds
 * (KISS; this is prototype localStorage, not a ledger — the accepted data loss is
 * documented in the plan, red-team #11). A v2 config is normalized (dedupe).
 */
function migrateJarConfig(stored: JarConfig | null): JarConfig {
  if (!stored || stored.version !== 2) return seed();
  return dedupeCategories(stored);
}

/** Remove `catIds` from every jar except `exceptId` (keeps categories unique). */
function stripCategories(jars: Jar[], catIds: string[], exceptId?: string): Jar[] {
  return jars.map((j) =>
    j.id === exceptId ? j : { ...j, categoryIds: j.categoryIds.filter((c) => !catIds.includes(c)) },
  );
}

/** A jar id not already taken (suffixes `-2`, `-3`… on collision). */
function uniqueJarId(jars: Jar[], base: string): string {
  const taken = new Set(jars.map((j) => j.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Enforce one-category-one-jar on an arbitrary config (first jar to claim a
 * category keeps it). The mutators already guarantee this, but a config coming
 * straight from storage — hand-edited, or written by a future migration — has
 * not been through them, and `evaluateJarPartition` would double-count an overlap. So
 * every loaded config is normalized here before it can reach the engine.
 */
function dedupeCategories(config: JarConfig): JarConfig {
  const seen = new Set<string>();
  return {
    ...config,
    jars: config.jars.map((j) => ({
      ...j,
      categoryIds: j.categoryIds.filter((c) => (seen.has(c) ? false : (seen.add(c), true))),
    })),
  };
}

interface JarConfigContextValue {
  config: JarConfig;
  addJar: (jar: Jar) => void;
  updateJar: (id: string, patch: Partial<Omit<Jar, "id">>) => void;
  removeJar: (id: string) => void;
  /** Move a category into `jarId` (removing it from any other), or out (null). */
  assignCategory: (categoryId: string, jarId: string | null) => void;
  setAllocation: (id: string, allocation: JarAllocation) => void;
  /** REPLACE the whole jar set with a template's (confirm-on-replace in UI). */
  applyTemplate: (templateId: JarTemplate["id"]) => void;
  resetToSeed: () => void;
}

const JarConfigContext = createContext<JarConfigContextValue | null>(null);

export function JarConfigProvider({ children }: { children: React.ReactNode }) {
  const providers = useProviders();
  const [config, setConfig] = useState<JarConfig>(seed);
  // Mirrors `config` synchronously so several mutations in one tick chain off the
  // latest value (state batching would otherwise feed each a stale snapshot).
  const configRef = useRef<JarConfig>(config);

  const apply = useCallback((next: JarConfig) => {
    configRef.current = next;
    setConfig(next);
  }, []);

  // Load on mount and on persona switch (providers identity changes per persona,
  // so each persona reloads its own stored config — never leaks across personas).
  useEffect(() => {
    let active = true;
    // Reset to seed synchronously first so a switched-to persona never shows the
    // previous persona's allocations for the tick before its load resolves (H5).
    apply(seed());
    providers
      .getJarConfig()
      .then((stored) => {
        if (active) apply(migrateJarConfig(stored));
      })
      .catch(() => {
        if (active) apply(seed());
      });
    return () => {
      active = false;
    };
  }, [providers, apply]);

  // Apply a pure transform to the current config and persist the result. The
  // persist is a plain side effect here (never inside a setState updater), so it
  // fires exactly once per mutation even under StrictMode double-invocation.
  const mutate = useCallback(
    (fn: (current: JarConfig) => JarConfig) => {
      const next = fn(configRef.current);
      apply(next);
      providers.saveJarConfig(next).catch(() => {});
    },
    [providers, apply],
  );

  const value = useMemo<JarConfigContextValue>(
    () => ({
      config,
      addJar: (jar) =>
        mutate((c) => {
          const next = { ...jar, id: uniqueJarId(c.jars, jar.id) };
          return { ...c, jars: [...stripCategories(c.jars, next.categoryIds), next] };
        }),
      updateJar: (id, patch) =>
        mutate((c) => {
          let jars = c.jars.map((j) => (j.id === id ? { ...j, ...patch } : j));
          if (patch.categoryIds) jars = stripCategories(jars, patch.categoryIds, id);
          return { ...c, jars };
        }),
      removeJar: (id) => mutate((c) => ({ ...c, jars: c.jars.filter((j) => j.id !== id) })),
      assignCategory: (categoryId, jarId) =>
        mutate((c) => {
          const jars = stripCategories(c.jars, [categoryId]);
          return {
            ...c,
            jars: jarId
              ? jars.map((j) =>
                  j.id === jarId ? { ...j, categoryIds: [...j.categoryIds, categoryId] } : j,
                )
              : jars,
          };
        }),
      setAllocation: (id, allocation) =>
        mutate((c) => ({
          ...c,
          jars: c.jars.map((j) => (j.id === id ? { ...j, allocation } : j)),
        })),
      applyTemplate: (templateId) =>
        mutate(() =>
          dedupeCategories(
            JSON.parse(JSON.stringify(configFromTemplate(JAR_TEMPLATES[templateId]))) as JarConfig,
          ),
        ),
      resetToSeed: () => mutate(() => seed()),
    }),
    [config, mutate],
  );

  return <JarConfigContext.Provider value={value}>{children}</JarConfigContext.Provider>;
}

export function useJarConfig(): JarConfigContextValue {
  const ctx = useContext(JarConfigContext);
  if (!ctx) throw new Error("useJarConfig must be used within <JarConfigProvider>");
  return ctx;
}
