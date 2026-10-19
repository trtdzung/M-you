"use client";

// Client side of the Scam Shield engine: the persona's open interventions,
// fetched at once after any engine event (`pokeInterventions`) and every 5 s.

import { useCallback, useEffect, useState } from "react";
import type { Intervention, RespondAction } from "@/lib/security/intervention-types";
import { usePersona } from "@/providers/context";

const POLL_MS = 5_000;
const POKE_EVENT = "msb-pfm:shield-poke";

/** Ask every mounted `useInterventions` to refetch now (after an engine call). */
export function pokeInterventions(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(POKE_EVENT));
}

export async function respondIntervention(cif: string, id: string, choice: string): Promise<RespondAction | null> {
  try {
    const res = await fetch(`/api/security/interventions/${encodeURIComponent(id)}/respond`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, choice }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { action: RespondAction }).action;
  } catch {
    return null;
  } finally {
    pokeInterventions();
  }
}

export function markInterventionShown(cif: string, id: string): void {
  void fetch(`/api/security/interventions/${encodeURIComponent(id)}/shown`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif }), keepalive: true,
  }).catch(() => {});
}

/** Open interventions for the active persona, optionally for one target (screen or anchor). */
export function useInterventions(target?: string) {
  const { persona } = usePersona();
  const cif = persona.cif;
  const [items, setItems] = useState<Intervention[]>([]);

  const refresh = useCallback(async () => {
    try {
      const query = new URLSearchParams({ cif, ...(target ? { target } : {}) });
      const res = await fetch(`/api/security/interventions?${query}`, { cache: "no-store" });
      if (!res.ok) return;
      setItems(((await res.json()) as { interventions: Intervention[] }).interventions);
    } catch {
      // keep what is on screen
    }
  }, [cif, target]);

  useEffect(() => {
    setItems([]);
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onPoke = () => void refresh();
    window.addEventListener(POKE_EVENT, onPoke);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(POKE_EVENT, onPoke);
    };
  }, [refresh]);

  const respond = useCallback(async (id: string, choice: string) => {
    setItems(current => current.filter(item => item.id !== id));
    return respondIntervention(cif, id, choice);
  }, [cif]);

  const shown = useCallback((id: string) => markInterventionShown(cif, id), [cif]);

  return { cif, items, respond, shown, refresh };
}
