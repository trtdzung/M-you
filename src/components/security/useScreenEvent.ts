"use client";

import { useEffect } from "react";
import { postSecurityEvent } from "@/lib/security/post-event";
import { usePersona } from "@/providers/context";

type ScreenEvent = "app_open" | "hub_open" | "transfer_screen_open";

// Strict-mode remounts and quick back/forward must not log the same screen twice.
const DEDUPE_MS = 2_000;
const lastSent = new Map<string, number>();

/**
 * Logs a screen-opened event for the Scam Shield engine when the component
 * mounts. `oncePerSession` logs at most once per browser tab (e.g. app open).
 */
export function useScreenEvent(type: ScreenEvent, options: { oncePerSession?: boolean } = {}): void {
  const { persona } = usePersona();
  const cif = persona.cif;
  const once = options.oncePerSession ?? false;
  useEffect(() => {
    const key = `${type}.${cif}`;
    if (once) {
      try {
        const storageKey = `msb-pfm.security-event.${key}`;
        if (window.sessionStorage.getItem(storageKey)) return;
        window.sessionStorage.setItem(storageKey, "1");
      } catch {
        // no session storage: fall back to the time dedupe below
      }
    }
    const now = Date.now();
    if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return;
    lastSent.set(key, now);
    postSecurityEvent(type, {}, cif);
  }, [type, cif, once]);
}
