"use client";

import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { useSecurityStore } from "@/state/security/store";

export function useRecovery() {
  const { persona } = usePersona();
  const code = useSecurityStore(s => s.antiPhishingCode);
  const contacts = useSecurityStore(s => s.emergencyContacts);
  const [state, setState] = useState<{ incidentAt: number | null; steps: boolean[]; cooldown: boolean }>({ incidentAt: null, steps: [], cooldown: false });
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/security/recovery?cif=${encodeURIComponent(persona.cif)}`, { cache: "no-store" });
        if (response.ok && active) setState(await response.json());
      } catch { /* keep the last known recovery state */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [persona.cif, code, contacts]);
  return state;
}
