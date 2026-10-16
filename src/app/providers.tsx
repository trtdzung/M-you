"use client";

/**
 * App-wide client providers. Order matters: persona (data source) → corrections
 * (overlay) → period (view state) → consent gate (access boundary) → screens.
 */

import { PersonaProvider } from "@/providers/context";
import { CorrectionsProvider } from "@/state/corrections";
import { PeriodProvider } from "@/state/period";
import { ConsentGate } from "@/components/consent/ConsentGate";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PersonaProvider>
      <CorrectionsProvider>
        <PeriodProvider>
          <ConsentGate>{children}</ConsentGate>
        </PeriodProvider>
      </CorrectionsProvider>
    </PersonaProvider>
  );
}
