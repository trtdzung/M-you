"use client";

/**
 * App-wide client providers. Order matters: persona (data source) → corrections
 * (overlay) → period (view state) → consent gate (access boundary) → screens.
 */

import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { CategoryMemoryProvider } from "@/state/category-memory";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { AutoCategorizeProvider } from "@/state/auto-categorize";
import { ConsentGate } from "@/components/consent/ConsentGate";
import { LoginGate } from "@/components/login/LoginGate";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PersonaProvider>
      <LoginGate>
        <CorrectionsProvider>
          <CategoryMemoryProvider>
            <ManualTxnsProvider>
              <JarConfigProvider>
                <AssetLiabilityProvider>
                  <GoalProvider>
                    <PeriodProvider>
                      <ConsentGate>
                        <AutoCategorizeProvider>{children}</AutoCategorizeProvider>
                      </ConsentGate>
                    </PeriodProvider>
                  </GoalProvider>
                </AssetLiabilityProvider>
              </JarConfigProvider>
            </ManualTxnsProvider>
          </CategoryMemoryProvider>
        </CorrectionsProvider>
      </LoginGate>
    </PersonaProvider>
  );
}
