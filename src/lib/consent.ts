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

/**
 * Same-tab consent changes are invisible to the native `storage` event (it only
 * fires in OTHER tabs). Writers dispatch this so in-tab subscribers (e.g. the
 * auto-categorize gate) re-read consent immediately on grant/revoke — otherwise
 * revoking "ai" mid-session would keep producing suggestions until a reload.
 */
export const CONSENT_CHANGED_EVENT = "msb-pfm.consent-changed";

function announceConsentChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

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

/**
 * Whether a consent record grants a specific scope. Use this — NOT
 * `hasValidConsent()` — to gate anything that sends data out (e.g. the "ai"
 * scope before a merchant name can leave the device). Null-safe.
 */
export function hasScope(record: ConsentRecord | null, scope: ConsentScope): boolean {
  return record !== null && record.scopes.includes(scope);
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
  announceConsentChange();
  return record;
}

/** Revoke consent (PFM-094 affordance). */
export function revokeConsent(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  announceConsentChange();
}
