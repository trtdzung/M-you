import type { ReactNode } from "react";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { GoalProvider } from "@/state/goals";
import { PeriodProvider } from "@/state/period";

/**
 * The extra providers `useFinancials` reads, for component tests that render a
 * surface computing jar balances (Settings → Hũ uses `useCurrentJarFunds`).
 * Place it INSIDE `PersonaProvider` + `ManualTxnsProvider` + `JarConfigProvider`
 * + `CategoryTaxonomyProvider` — it adds only what those don't already supply.
 * Every provider here talks to the real stubbed fetch (vitest.setup), never fixtures.
 */
export function FinancialsTestProviders({ children }: { children: ReactNode }) {
  return (
    <CorrectionsProvider>
      <AssetLiabilityProvider>
        <GoalProvider>
          <PeriodProvider>{children}</PeriodProvider>
        </GoalProvider>
      </AssetLiabilityProvider>
    </CorrectionsProvider>
  );
}
