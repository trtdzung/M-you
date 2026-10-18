import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { ensureCcBrief } from "./cc-brief";
import { engineNow } from "./clock";
import { recordEvent } from "./events";
import { findOpenByDedupe, insertIntervention } from "./intervention-store";
import { readProfile, writeProfile } from "./profile-store";
import { SCENARIO_COPY } from "./scenario-copy";

/** SC1 is an explicit customer request, even when AI protection is off. */
export function startEmergency(cif: string) {
  const existing = findOpenByDedupe(cif, "SC1");
  if (existing) return existing;
  const now = engineNow(cif).getTime();
  return getDb().transaction(() => {
    const intervention = insertIntervention({ cif, scenario: "SC1", level: "red", surface: "fullscreen", target: "global",
      dedupeKey: "SC1", context: { scenarios: ["SC1"], classify: false, evidence: [], key: null },
      copy: SCENARIO_COPY.SC1, countdownSec: null, createdAt: now });
    const contacts = readProfile(cif).emergencyContacts.filter(c => c.status === "active" || c.status === "removing");
    if (contacts.length) recordEvent(cif, "family_push", {
      message: `${SCENARIO_COPY.SC1.message} (giả lập)`, scenario: "SC1", contactIds: contacts.map(c => c.id),
    }, now);
    return intervention;
  })();
}

/** Lock only after the customer confirms; reserve a case ID for E17. */
export function lockEmergency(cif: string) {
  return getDb().transaction(() => {
    const profile = readProfile(cif);
    if (profile.accountLocked && profile.cardsLocked) return profile;
    const now = engineNow(cif).getTime();
    const pendingOff = { ...profile.pendingOff };
    delete pendingOff.accountLock;
    const state = { ...profile, accountLocked: true, cardsLocked: true, accountLockedAt: now, pendingOff };
    writeProfile(cif, state);
    recordEvent(cif, "account_locked", {}, now);
    recordEvent(cif, "case_opened", { caseId: randomUUID() }, now);
    try { ensureCcBrief(cif); } catch { console.error("SC1 cc brief failed"); }
    return state;
  })();
}
