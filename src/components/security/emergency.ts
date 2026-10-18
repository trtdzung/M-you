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
