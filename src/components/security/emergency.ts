"use client";

import type { SecurityState } from "@/state/security/types";
import { pokeInterventions } from "./useInterventions";

export async function requestEmergency(cif: string, action: "enter" | "lock"): Promise<SecurityState | true | null> {
  try {
    const response = await fetch("/api/security/emergency", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, action }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    pokeInterventions();
    return result.state ?? true;
  } catch {
    return null;
  }
}

/** Latest simulated CC/RM summary, written only after the account is locked. */
export async function loadEmergencyBrief(cif: string): Promise<string | null> {
  try {
    const response = await fetch("/api/security/emergency", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, action: "brief" }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result.brief?.summary === "string" ? result.brief.summary : null;
  } catch {
    return null;
  }
}
