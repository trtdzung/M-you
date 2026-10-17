"use client";

/**
 * App-wide client providers. Order matters: persona (data source) → corrections
 * (overlay) → period (view state) → consent gate (access boundary) → screens.
 *
 * `CategoryTaxonomyProvider` sits INSIDE `JarConfigProvider` because a category
 * write also rewrites the hũ set and hands the returned config to
 * `useJarConfig().applyServerConfig` — one owner for the jar config, so a
 * category can never end up in two hũ client-side (invariant #6). Category
 * MEMORY in turn sits inside the taxonomy: it validates what it learns against
 * the persona's stored categories, so a custom one is remembered too.
 */

import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { CategoryTaxonomyProvider } from "@/state/categories";
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
          <ManualTxnsProvider>
            <JarConfigProvider>
              <CategoryTaxonomyProvider>
                <CategoryMemoryProvider>
                  <AssetLiabilityProvider>
                    <GoalProvider>
                      <PeriodProvider>
                        <ConsentGate>
                          <AutoCategorizeProvider>{children}</AutoCategorizeProvider>
                        </ConsentGate>
                      </PeriodProvider>
                    </GoalProvider>
                  </AssetLiabilityProvider>
                </CategoryMemoryProvider>
              </CategoryTaxonomyProvider>
            </JarConfigProvider>
          </ManualTxnsProvider>
        </CorrectionsProvider>
      </LoginGate>
    </PersonaProvider>
  );
}
