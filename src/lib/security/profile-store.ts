import "server-only";

/**
 * Read/write access to `security_profiles` (Scam Shield settings per persona).
 * Server only. A missing row reads back as `null` so the client can tell "never
 * saved" from "saved defaults"; `readProfile` is for server code that needs a
 * usable state (engine, agent tools) and falls back to `SECURITY_DEFAULTS`.
 */

import { SECURITY_DEFAULTS } from "@/state/security/defaults";
import type { AlertLogEntry, EmergencyContact, SecurityState, TrustedContact } from "@/state/security/types";
import { getDb } from "@/lib/db";

const MAX_LIST = 200;
const MAX_TEXT = 200;

const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === "string" && v.length <= max;
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function emergencyContact(v: unknown): EmergencyContact | null {
  if (!isRecord(v) || !isText(v.id) || !isText(v.name) || !isText(v.relation) || !isText(v.phone)) return null;
  if (v.status !== "pending" && v.status !== "active" && v.status !== "removing") return null;
  return { id: v.id, name: v.name, relation: v.relation, phone: v.phone, status: v.status, ...(isTime(v.removeAt) ? { removeAt: v.removeAt } : {}) };
}

function trustedContact(v: unknown): TrustedContact | null {
  if (!isRecord(v) || !isText(v.id) || !isText(v.name) || !isText(v.bank) || !isText(v.account)) return null;
  return { id: v.id, name: v.name, bank: v.bank, account: v.account };
}

function alertEntry(v: unknown): AlertLogEntry | null {
  if (!isRecord(v) || !isText(v.id) || !isTime(v.at) || !isText(v.situation, 500) || !isText(v.choice)) return null;
  if (v.level !== "yellow" && v.level !== "red") return null;
  return { id: v.id, at: v.at, level: v.level, situation: v.situation, choice: v.choice, ...(isText(v.note, 500) ? { note: v.note } : {}) };
}

function list<T>(v: unknown, item: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > MAX_LIST) return null;
  const out = v.map(item);
  return out.every((x): x is T => x !== null) ? out : null;
}

/** A full `SecurityState` from untrusted JSON, or an error naming the first bad field. */
export function sanitizeSecurityState(v: unknown): SecurityState | { error: string } {
  if (!isRecord(v)) return { error: "state must be an object" };
  const bool = (key: "aiProtect" | "familyAlerts" | "securityTips") => typeof v[key] === "boolean";
  if (!bool("aiProtect") || !bool("familyAlerts") || !bool("securityTips")) return { error: "flags are invalid" };
  if (v.antiPhishingCode !== null && !isText(v.antiPhishingCode, 12)) return { error: "antiPhishingCode is invalid" };
  const emergencyContacts = list(v.emergencyContacts, emergencyContact);
  const trustedContacts = list(v.trustedContacts, trustedContact);
  const alertLog = list(v.alertLog, alertEntry);
  if (!emergencyContacts || !trustedContacts || !alertLog) return { error: "lists are invalid" };
  for (const key of ["transferLockUntil", "accountLockedAt"] as const) {
    if (v[key] !== null && !isTime(v[key])) return { error: `${key} is invalid` };
  }
  if (typeof v.accountLocked !== "boolean") return { error: "accountLocked is invalid" };
  if (!isRecord(v.pendingOff)) return { error: "pendingOff is invalid" };
  const pendingOff: SecurityState["pendingOff"] = {};
  for (const key of ["aiProtect", "antiPhishing", "transferLock", "accountLock"] as const) {
    const at = v.pendingOff[key];
    if (at === undefined) continue;
    if (!isTime(at)) return { error: "pendingOff is invalid" };
    pendingOff[key] = at;
  }
  return {
    aiProtect: v.aiProtect as boolean,
    familyAlerts: v.familyAlerts as boolean,
    securityTips: v.securityTips as boolean,
    antiPhishingCode: v.antiPhishingCode as string | null,
    emergencyContacts,
    trustedContacts,
    transferLockUntil: v.transferLockUntil as number | null,
    accountLocked: v.accountLocked,
    accountLockedAt: v.accountLockedAt as number | null,
    pendingOff,
    alertLog,
  };
}

/** The persona's saved state, or `null` when it never saved one. */
export function readSavedProfile(cif: string): SecurityState | null {
  const row = getDb().prepare("SELECT payload FROM security_profiles WHERE cif = ?").get(cif) as { payload: string } | undefined;
  if (!row) return null;
  try {
    const state = sanitizeSecurityState(JSON.parse(row.payload));
    return "error" in state ? null : state;
  } catch {
    return null;
  }
}

/** Saved state, or the demo defaults for a persona that never saved one. */
export function readProfile(cif: string): SecurityState {
  return readSavedProfile(cif) ?? SECURITY_DEFAULTS;
}

export function writeProfile(cif: string, state: SecurityState): void {
  getDb()
    .prepare(
      `INSERT INTO security_profiles (cif, payload, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(cif) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    )
    .run(cif, JSON.stringify(state), Date.now());
}
