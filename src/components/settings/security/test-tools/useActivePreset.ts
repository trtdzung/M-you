"use client";

import { SECURITY_DEFAULTS } from "@/state/security/defaults";
import { useSecurityStore } from "@/state/security/store";
import { useTestToolsStore } from "@/state/security/test-tools";
import { stateSignature } from "./actions";

const DEFAULT_SIGNATURE = stateSignature(SECURITY_DEFAULTS);

/** Id of the preset the current Scam Shield state still matches, or null once something was changed by hand. */
export function useActivePreset(): string | null {
  const applied = useTestToolsStore(state => state.appliedPreset);
  // Selecting the signature string (not an object) keeps re-renders cheap and stable.
  const signature = useSecurityStore(state => state.hasHydrated ? stateSignature(state) : null);
  if (signature === null) return null;
  if (applied && signature === applied.signature) return applied.id;
  // Untouched defaults read as "Mặc định" even before any preset was applied.
  return signature === DEFAULT_SIGNATURE ? "default" : null;
}
