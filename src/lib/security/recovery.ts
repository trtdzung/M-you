import "server-only";

import { engineNow } from "./clock";
import { eventsSince } from "./events";
import type { SecurityState } from "@/state/security/types";
import { readProfile } from "./profile-store";

/** Recovery and product cooldown share the latest incident and the engine clock. */
export function recoveryState(cif: string, savedProfile?: SecurityState) {
  const now = engineNow(cif).getTime();
  const incident = eventsSince(cif, 0, ["account_locked", "case_opened"]).filter(e => e.at <= now).at(-1);
  if (!incident) return { incidentAt: null, steps: [false, false, false, false], cooldown: false };
  const profile = savedProfile ?? readProfile(cif);
  const events = eventsSince(cif, incident.at, ["password_changed", "devices_signed_out"]);
  return { incidentAt: incident.at, steps: [events.some(e => e.type === "password_changed" && e.at <= now),
    events.some(e => e.type === "devices_signed_out" && e.at <= now), profile.antiPhishingCode !== null,
    profile.emergencyContacts.length > 0],
    cooldown: now - incident.at < 7 * 24 * 60 * 60 * 1000 };
}
