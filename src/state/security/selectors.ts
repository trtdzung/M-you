// Pure Scam Shield selectors. No React, no store import.

import type { EmergencyContact, SecurityState } from "./types";

export type TransferBlock =
  | { blocked: false }
  | { blocked: true; reason: "account-locked" | "transfer-locked"; until?: number };

/** Contacts that will be notified: accepted, including ones waiting out a 24h removal. */
export function effectiveContacts(state: Pick<SecurityState, "emergencyContacts">): EmergencyContact[] {
  return state.emergencyContacts.filter(contact => contact.status !== "pending");
}

export function isTransferLocked(state: Pick<SecurityState, "transferLockUntil">, now: number): boolean {
  return state.transferLockUntil !== null && state.transferLockUntil > now;
}

/** Customer-requested blocks only; an emergency account lock wins over a timed transfer lock. */
export function isTransferBlocked(state: Pick<SecurityState, "accountLocked" | "transferLockUntil">, now: number): TransferBlock {
  if (state.accountLocked) return { blocked: true, reason: "account-locked" };
  if (isTransferLocked(state, now)) return { blocked: true, reason: "transfer-locked", until: state.transferLockUntil ?? undefined };
  return { blocked: false };
}
