import "server-only";

import { getDb } from "@/lib/db";

const OFF = new Set(["0", "false", "off"]);

/** Server config forces the Fraud agent off. */
export function fraudAgentForcedOff(): boolean {
  return OFF.has((process.env.FRAUD_AGENT_ENABLED ?? "").trim().toLowerCase());
}

/** False → do not call the agent; screens keep the spec wording. */
export function fraudAgentEnabled(): boolean {
  if (fraudAgentForcedOff()) return false;
  const row = getDb().prepare("SELECT enabled FROM fraud_agent_switch WHERE agent = 'fraud'").get() as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

export function readFraudAgentSwitch(): { enabled: boolean; forcedOff: boolean } {
  return { enabled: fraudAgentEnabled(), forcedOff: fraudAgentForcedOff() };
}
