// Client side: tell the Scam Shield engine something happened. Fire and forget:
// a lost event never blocks the flow that raised it.

import { getSecurityCif } from "@/state/security/storage";
import type { SecurityEventPayloads, SecurityEventType } from "./event-types";

export function postSecurityEvent<T extends SecurityEventType>(type: T, payload: SecurityEventPayloads[T], forCif?: string): void {
  const cif = forCif ?? getSecurityCif();
  if (!cif || typeof window === "undefined") return;
  void fetch("/api/security/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, type, payload }),
    keepalive: true,
  }).catch(() => {});
}

/** Last 4 digits of a full or masked account number ("" when there are fewer). */
export function lastFourDigits(account: string | null | undefined): string {
  const digits = (account ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}
