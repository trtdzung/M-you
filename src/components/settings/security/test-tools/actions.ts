// Test-tool actions shared by the test-tools screen and the floating quick-action
// button. All go through the existing stores; demo data only.

import { transferNow } from "@/lib/demo-clock";
import { SECURITY_DEFAULTS } from "@/state/security/defaults";
import { useSecurityStore } from "@/state/security/store";
import type { TestPreset } from "@/state/security/test-presets";
import { useTestToolsStore } from "@/state/security/test-tools";
import { getSecurityCif } from "@/state/security/storage";
import type { SecurityState } from "@/state/security/types";
import type { PendingOff } from "../pending";
import { emitEngineChange } from "./sim";

/**
 * Scam Shield data a preset sets (everything but the alert log), as a stable
 * string. A preset counts as "in use" only while the state still matches it, so
 * a manual change elsewhere clears the mark.
 */
export function stateSignature(state: SecurityState): string {
  return JSON.stringify((Object.keys(SECURITY_DEFAULTS) as (keyof SecurityState)[]).filter(key => key !== "alertLog").map(key => state[key]));
}

function markApplied(id: string): void {
  useTestToolsStore.getState().setAppliedPreset({ id, signature: stateSignature(useSecurityStore.getState()) });
}

/** Replaces Scam Shield state with a preset, keeping the current alert log. */
export function applyPreset(preset: TestPreset): void {
  const { alertLog } = useSecurityStore.getState();
  useSecurityStore.setState(preset.build({ ...SECURITY_DEFAULTS, alertLog }, transferNow().getTime()));
  markApplied(preset.id);
}

/** Scam Shield back to defaults, and this persona's engine rows wiped on the server. */
export async function resetTestState(): Promise<void> {
  const cif = getSecurityCif();
  if (cif) {
    const res = await fetch("/api/security/reset", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif }),
    });
    if (!res.ok) throw new Error("Không đặt lại được dữ liệu engine.");
  }
  useSecurityStore.getState().reset();
  useTestToolsStore.setState({ alertHour: null });
  markApplied("default");
  emitEngineChange();
}

/** Requests still waiting out the 24h delay: turn-offs plus contacts being removed. */
export function pendingCount(state: Pick<SecurityState, "pendingOff" | "emergencyContacts">): number {
  return Object.keys(state.pendingOff).length + state.emergencyContacts.filter(contact => contact.status === "removing").length;
}

/** Applies every request still waiting out the 24h delay, right now. */
export function applyAllPending(): void {
  const { pendingOff, emergencyContacts, applyOff, applyRemoveContact } = useSecurityStore.getState();
  (Object.keys(pendingOff) as (keyof PendingOff)[]).forEach(key => applyOff(key));
  emergencyContacts.filter(contact => contact.status === "removing").forEach(contact => applyRemoveContact(contact.id));
}

/** Alert log back to the 3 demo rows, or emptied. */
export function setAlertLog(kind: "demo" | "clear"): void {
  useSecurityStore.setState({ alertLog: kind === "demo" ? SECURITY_DEFAULTS.alertLog : [] });
}
