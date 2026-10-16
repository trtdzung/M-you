/**
 * The ONE client/engine selector for the CASA balance — Σ `availableBalance` of a
 * persona's `type === "current"` accounts. This mirrors the server denominator
 * `casaPoolForCif` (`src/lib/casa-pool.ts`) exactly, so the unallocated pool and
 * the funding decision tree never diverge from the server cap (Red Team #9/#7).
 *
 * Deliberately NOT `accounts[0].balance`: a persona may hold more than one
 * `current` account, and savings/credit balances must never leak into the pool.
 * Filtering happens HERE (internally), so any caller can pass an unfiltered
 * `Account[]` safely.
 *
 * Returns a plain number (0 when there is no `current` account). Unlike
 * `casaPool` (jar-envelope), which returns the "unknown" sentinel for provenance
 * display, this selector feeds arithmetic (`computeUnallocatedPool`,
 * `evaluateFunding`) — a missing CASA yields a 0 denominator, and the caller
 * decides how to present "no account" (never a fabricated positive balance).
 */

import type { Account } from "@/domain/models";
import { UNKNOWN, type Amount } from "./types";

/** Σ `availableBalance` of `type === "current"` accounts (0 when none). */
export function casaBalance(accounts: Account[]): number {
  return accounts.reduce(
    (sum, account) => (account.type === "current" ? sum + account.availableBalance : sum),
    0,
  );
}

/**
 * Same Σ, but "unknown" when the persona has NO `current` account — the input the
 * unallocated pool needs so a missing CASA never becomes a fabricated 0 (D27).
 */
export function casaBalanceOrUnknown(accounts: Account[]): Amount {
  return accounts.some((a) => a.type === "current") ? casaBalance(accounts) : UNKNOWN;
}
