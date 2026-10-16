"use client";

/**
 * App-wide client providers. Order matters: persona (data source) → corrections
 * (overlay) → period (view state) → consent gate (access boundary) → screens.
 */

import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { ConsentGate } from "@/components/consent/ConsentGate";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PersonaProvider>
      <CorrectionsProvider>
        <ManualTxnsProvider>
          <JarConfigProvider>
            <AssetLiabilityProvider>
              <GoalProvider>
                <PeriodProvider>
                  <ConsentGate>{children}</ConsentGate>
                </PeriodProvider>
              </GoalProvider>
            </AssetLiabilityProvider>
          </JarConfigProvider>
        </ManualTxnsProvider>
      </CorrectionsProvider>
    </PersonaProvider>
  );
}
