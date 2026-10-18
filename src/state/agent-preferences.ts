"use client";

/**
 * The active persona's standing M-You instructions (`AgentPreferences`) — read
 * on mount/persona change, saved as one whole-row write. Mirrors the shape of
 * the app's other persona-scoped state hooks (`useJarConfig`, `useCategories`):
 * the provider is the only path to the data (invariant #4), this hook just
 * tracks loading/error and resets the "seeded this thread" flag
 * (`resetPreferenceSeed`) after every successful save so an edit reaches the
 * agent on the customer's very next message, not after a history delete.
 */

import { useCallback, useEffect, useState } from "react";
import { EMPTY_AGENT_PREFERENCES, type AgentPreferences } from "@/domain/models";
import { resetPreferenceSeed, type PreferenceStatus } from "@/lib/agent-preference-seed";
import { usePersona, useProviders } from "@/providers/context";

export function useAgentPreferences() {
  const { persona } = usePersona();
  const providers = useProviders();
  const cif = persona.cif;
  const [preferences, setPreferences] = useState<AgentPreferences>(EMPTY_AGENT_PREFERENCES);
  const [status, setStatus] = useState<PreferenceStatus>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    providers
      .getAgentPreferences()
      .then((p) => {
        setPreferences(p);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [providers]);

  useEffect(() => {
    load();
  }, [load, cif]);

  /** Save the whole form; throws (as the provider does) on a refused write — the caller's form stays open and shows why. */
  const save = useCallback(
    async (next: AgentPreferences) => {
      setSaveError(null);
      const saved = await providers.saveAgentPreferences(next);
      setPreferences(saved);
      resetPreferenceSeed(cif); // the edit should reach the agent on the next message, not wait for a delete
      return saved;
    },
    [providers, cif],
  );

  return { preferences, status, save, saveError, setSaveError, reload: load };
}
