"use client";

/**
 * Jar CASA-cap probe for screens that need the write-door denominator but don't
 * compute full `Financials` — namely Cài đặt's `HuEditorSheet` (a single jar edit
 * still must respect the BALANCE-lens cap `Σ spendable ≤ CASA`). Reads the persona's
 * accounts + bank history once and reuses the engine's `jarSpendableTotal` — the
 * SAME path the server cap and the Overview envelope take — so the preview can never
 * disagree with what the server allows (DRY, invariant #1). The server re-checks the
 * cap regardless; this is UX (a false block would be the same "422 trap" the balance
 * lens exists to avoid, so it must use the same lens).
 */

import { useEffect, useMemo, useState } from "react";
import { casaPool, jarSpendableTotal } from "@/domain/engine";
import type { Amount } from "@/domain/engine/types";
import type { Account, Jar, Transaction } from "@/domain/models";
import { DEMO_NOW } from "@/lib/demo-clock";
import { useProviders } from "@/providers/context";

export interface JarCapProbe {
  /** Raw CASA (Σ `availableBalance` of `current` accounts); "unknown" until loaded / no CASA. */
  casa: Amount;
  /**
   * Σ spendable (`Σ max(0, remaining)`) a jar config would hold under the persona's
   * live spend, or `null` until accounts + history have loaded — while null the
   * caller skips the client preview and lets the server decide (never a false block).
   */
  spendableTotal: ((jars: Jar[]) => number) | null;
}

export function useJarCapProbe(): JarCapProbe {
  const providers = useProviders();
  const [data, setData] = useState<{ accounts: Account[]; txns: Transaction[] } | null>(null);
  const [casa, setCasa] = useState<Amount>("unknown");

  useEffect(() => {
    let active = true;
    setData(null);
    setCasa("unknown");
    Promise.all([providers.listAccounts(), providers.listTransactions()])
      .then(([accounts, txns]) => {
        if (!active) return;
        setData({ accounts, txns });
        setCasa(casaPool(accounts).amount);
      })
      .catch(() => {
        if (active) {
          setData(null);
          setCasa("unknown");
        }
      });
    return () => {
      active = false;
    };
  }, [providers]);

  const spendableTotal = useMemo(
    () => (data ? (jars: Jar[]) => jarSpendableTotal(jars, data.accounts, data.txns, DEMO_NOW).total : null),
    [data],
  );

  return { casa, spendableTotal };
}
