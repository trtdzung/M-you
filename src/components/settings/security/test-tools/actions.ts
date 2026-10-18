// Test-tool actions shared by the test-tools screen and the floating quick-action
// button. All go through the existing stores; demo data only.

import { transferNow } from "@/lib/demo-clock";
import { SECURITY_DEFAULTS } from "@/state/security/defaults";
import { useSecurityStore } from "@/state/security/store";
import type { TestPreset } from "@/state/security/test-presets";
import { useTestToolsStore } from "@/state/security/test-tools";
import type { SecurityState } from "@/state/security/types";
import type { PendingOff } from "../pending";

/** Replaces Scam Shield state with a preset, keeping the current alert log. */
export function applyPreset(preset: TestPreset): void {
  const { alertLog } = useSecurityStore.getState();
  useSecurityStore.setState(preset.build({ ...SECURITY_DEFAULTS, alertLog }, transferNow().getTime()));
}

/** Scam Shield back to defaults and the alert hour back to the real clock. */
export function resetTestState(): void {
  useSecurityStore.getState().reset();
  useTestToolsStore.getState().setAlertHour(null);
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
