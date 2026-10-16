"use client";

/**
 * Spending-jar configuration state. A thin client over `/api/jars*`
 * (SQLite-backed, see `data/jars/schema.md`) — every business invariant
 * (one-category-one-jar, `actualAmount` backfill) is enforced SERVER-SIDE
 * now (`src/domain/jar-rules.ts`, used by the route handlers); this provider
 * just calls the matching endpoint and stores whatever `JarConfig` comes
 * back. Loads on mount and whenever the persona changes (provider identity
 * change); every mutation re-syncs from that call's response.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Jar, JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG, JAR_TEMPLATES, type JarTemplate } from "@/domain/models/jar-defaults";
import { useProviders } from "@/providers/context";

interface JarConfigContextValue {
  config: JarConfig;
  addJar: (jar: Jar) => void;
  updateJar: (id: string, patch: Partial<Omit<Jar, "id">>) => void;
  /**
   * Patch several jars in ONE atomic write ("Chia ngay" sets every jar's
   * budgetLimit at once). Server enforces the CASA cap and returns the full
   * config; a single `setConfig` applies it (no `Promise.all` race). Returns the
   * promise so callers can surface a rejected write (e.g. a 422 over-cap).
   */
  updateJars: (patches: Record<string, Partial<Omit<Jar, "id">>>) => Promise<void>;
  /** Remove a jar; its categories are force-moved to "Khác" first (exactly-one). */
  removeJar: (id: string) => void;
  /**
   * Move a category into `jarId` (removing it from any other). Under exactly-one a
   * category can never be unassigned: `jarId === null` is a no-op (a category
   * always belongs to some jar). Pass a real jar id to move it.
   */
  assignCategory: (categoryId: string, jarId: string | null) => void;
  /** REPLACE the whole jar set with a template's (confirm-on-replace in UI). */
  applyTemplate: (templateId: JarTemplate["id"]) => void;
  resetToSeed: () => void;
  /**
   * Debit `amount` from a jar's real balance (Chuyển tiền Phần 1 — chosen as
   * a transfer source). No-op if the jar is missing or has no `actualAmount`
   * yet — the UI already validates "đủ tiền" before this is ever called;
   * this is only a defensive backstop, never the source of that check.
   */
  spendFromJar: (id: string, amount: number) => void;
}

const EMPTY_CONFIG: JarConfig = { version: 3, jars: [] };

/**
 * Every mutator below is fire-and-forget from its caller's point of view
 * (none of them are awaited — e.g. `TransferConfirm`'s `spendFromJar` call
 * during a money transfer). Without a `.catch`, a rejected fetch (offline, a
 * 404/422/500) becomes an unhandled promise rejection and the failure is
 * invisible — the UI silently keeps stale data instead of surfacing that the
 * write never happened.
 */
function logJarMutationError(err: unknown): void {
  console.error("Jar mutation failed", err);
}

const JarConfigContext = createContext<JarConfigContextValue | null>(null);

export function JarConfigProvider({ children }: { children: React.ReactNode }) {
  const providers = useProviders();
  const [config, setConfig] = useState<JarConfig>(EMPTY_CONFIG);

  // Load on mount and on persona switch (providers identity changes per
  // persona). Reset to empty FIRST, synchronously, before the async fetch —
  // otherwise the previous persona's jars stay on screen until the new
  // persona's fetch resolves (H5: config must never leak across personas).
  useEffect(() => {
    let active = true;
    setConfig(EMPTY_CONFIG);
    providers
      .getJarConfig()
      .then((next) => {
        if (active) setConfig(next);
      })
      .catch((err: unknown) => {
        console.error("Failed to load jar config", err);
      });
    return () => {
      active = false;
    };
  }, [providers]);

  const value = useMemo<JarConfigContextValue>(
    () => ({
      config,
      addJar: (jar) => {
        providers.createJar(jar).then(setConfig).catch(logJarMutationError);
      },
      updateJar: (id, patch) => {
        providers.updateJar(id, patch).then(setConfig).catch(logJarMutationError);
      },
      updateJars: (patches) =>
        // One setConfig from the batch response (H1). The promise is returned so
        // the caller (AllocationSheet) can keep its draft on a rejected write.
        providers.updateJars(patches).then((next) => {
          setConfig(next);
        }),
      removeJar: (id) => {
        providers.removeJar(id).then(setConfig).catch(logJarMutationError);
      },
      assignCategory: (categoryId, jarId) => {
        // Unassign is forbidden under exactly-one — a null target is a no-op.
        if (jarId === null) return;
        providers.assignCategory(categoryId, jarId).then(setConfig).catch(logJarMutationError);
      },
      applyTemplate: (templateId) => {
        providers.replaceJars(JAR_TEMPLATES[templateId].jars).then(setConfig).catch(logJarMutationError);
      },
      resetToSeed: () => {
        providers.replaceJars(DEFAULT_JAR_CONFIG.jars).then(setConfig).catch(logJarMutationError);
      },
      spendFromJar: (id, amount) => {
        const jar = config.jars.find((j) => j.id === id);
        if (!jar || jar.actualAmount === undefined) return;
        providers
          .updateJar(id, { actualAmount: Math.max(0, jar.actualAmount - amount) })
          .then(setConfig)
          .catch(logJarMutationError);
      },
    }),
    [config, providers],
  );

  return <JarConfigContext.Provider value={value}>{children}</JarConfigContext.Provider>;
}

export function useJarConfig(): JarConfigContextValue {
  const ctx = useContext(JarConfigContext);
  if (!ctx) throw new Error("useJarConfig must be used within <JarConfigProvider>");
  return ctx;
}
