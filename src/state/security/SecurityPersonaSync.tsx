"use client";

import { useEffect } from "react";
import { usePersona } from "@/providers/context";
import { useSecurityStore } from "./store";
import { loadAlertHour } from "./test-tools";

/** Keeps the Scam Shield store on the active persona's saved state. Renders nothing. */
export function SecurityPersonaSync() {
  const { persona } = usePersona();
  useEffect(() => {
    void useSecurityStore.getState().switchPersona(persona.cif);
    void loadAlertHour(persona.cif);
  }, [persona.cif]);
  return null;
}
