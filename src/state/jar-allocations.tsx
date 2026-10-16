"use client";

/**
 * Envelope-allocation state — a thin client over `/api/jar-allocations`
 * (SQLite-backed, see `data/jar-allocations/schema.md`). Mirrors
 * `JarConfigProvider`: loads on mount and on persona switch, and every "Chia
 * ngay" write re-syncs from that call's response.
 *
 * Allocations are bookkeeping of money already received — nothing here moves
 * real money or touches a transfer/OTP (invariant #3). Unlike jars, an
 * allocation write does NOT change `actualAmount`; the funded "còn lại trong
 * hũ" is engine-derived from these rows.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { JarAllocation } from "@/domain/models";
import { useProviders } from "@/providers/context";

export interface AllocationInputRow {
  txnId: string;
  jarId: string;
  amount: number;
}

interface JarAllocationsContextValue {
  allocations: JarAllocation[];
  /** Append a batch; resolves once state has re-synced from the server. */
  allocate: (rows: AllocationInputRow[]) => Promise<void>;
}

const JarAllocationsContext = createContext<JarAllocationsContextValue | null>(null);

export function JarAllocationsProvider({ children }: { children: React.ReactNode }) {
  const providers = useProviders();
  const [allocations, setAllocations] = useState<JarAllocation[]>([]);

  // Reset FIRST, synchronously, before the async fetch — so a previous persona's
  // allocations never linger across a persona switch (mirrors JarConfigProvider).
  useEffect(() => {
    let active = true;
    setAllocations([]);
    providers
      .getJarAllocations()
      .then((next) => {
        if (active) setAllocations(next);
      })
      .catch((err: unknown) => {
        console.error("Failed to load jar allocations", err);
      });
    return () => {
      active = false;
    };
  }, [providers]);

  const value = useMemo<JarAllocationsContextValue>(
    () => ({
      allocations,
      allocate: async (rows) => {
        const next = await providers.allocateIncome(rows);
        setAllocations(next);
      },
    }),
    [allocations, providers],
  );

  return <JarAllocationsContext.Provider value={value}>{children}</JarAllocationsContext.Provider>;
}

export function useJarAllocations(): JarAllocationsContextValue {
  const ctx = useContext(JarAllocationsContext);
  if (!ctx) throw new Error("useJarAllocations must be used within <JarAllocationsProvider>");
  return ctx;
}
