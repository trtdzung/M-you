"use client";

import { useEffect } from "react";
import { usePersona } from "@/providers/context";
import { useSecurityStore } from "./store";

// The demo clock can jump (goal time travel), so check often rather than scheduling one timeout.
const SETTLE_EVERY_MS = 30_000;

/** Keeps the Scam Shield store on the active persona's saved state and applies decreases once their 24h wait is over. Renders nothing. */
export function SecurityPersonaSync() {
  const { persona } = usePersona();
  useEffect(() => {
    void useSecurityStore.getState().switchPersona(persona.cif);
  }, [persona.cif]);
  useEffect(() => {
    const settle = () => { if (useSecurityStore.getState().hasHydrated) useSecurityStore.getState().settleDueOff(); };
    const timer = window.setInterval(settle, SETTLE_EVERY_MS);
    document.addEventListener("visibilitychange", settle);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", settle); };
  }, []);
  return null;
}
