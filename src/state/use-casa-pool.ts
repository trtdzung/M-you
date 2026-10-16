"use client";

/**
 * Lightweight CASA-pool reader for screens that need the jar-cap denominator but
 * don't compute full `Financials` — namely Cài đặt's `HuEditorSheet` (a single
 * jar edit still must respect Σ budgetLimit ≤ CASA). Reads only `listAccounts()`
 * and reuses the engine's `casaPool` so the number matches the Overview envelope
 * (DRY, invariant #1). The server re-checks the cap regardless — this is UX.
 */

import { useEffect, useState } from "react";
import { casaPool } from "@/domain/engine";
import type { Amount } from "@/domain/engine/types";
import { useProviders } from "@/providers/context";

export function useCasaPool(): Amount {
  const providers = useProviders();
  const [pool, setPool] = useState<Amount>("unknown");

  useEffect(() => {
    let active = true;
    setPool("unknown");
    providers
      .listAccounts()
      .then((accounts) => {
        if (active) setPool(casaPool(accounts).amount);
      })
      .catch(() => {
        if (active) setPool("unknown");
      });
    return () => {
      active = false;
    };
  }, [providers]);

  return pool;
}
