/**
 * Consent is the data-access boundary (privacy invariant). We persist only a
 * version, a timestamp, and the accepted scopes locally — never PII. Revocation
 * (PFM-094) clears this record.
 */

export const CONSENT_VERSION = "2026-09-01";

export type ConsentScope = "transactions" | "assets" | "liabilities" | "ai";

export interface ConsentRecord {
  version: string;
  acceptedAt: string;
  scopes: ConsentScope[];
}

const STORAGE_KEY = "msb-pfm.consent";

export const ALL_SCOPES: ConsentScope[] = ["transactions", "assets", "liabilities", "ai"];

export function getConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.version !== CONSENT_VERSION) return null; // re-consent on version bump
    return parsed;
  } catch {
    return null;
  }
}

export function hasValidConsent(): boolean {
  return getConsent() !== null;
}

export function setConsent(scopes: ConsentScope[] = ALL_SCOPES): ConsentRecord {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    scopes,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore storage errors
  }
  return record;
}

/** Revoke consent (PFM-094 affordance). */
export function revokeConsent(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
