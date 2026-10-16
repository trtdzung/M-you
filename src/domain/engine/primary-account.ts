/**
 * Primary-account resolution (extracted from the retired balance-lens `jars.ts`).
 * The primary account is the single `type:"current"` account; 0 or 2+ current
 * accounts make the balance genuinely ambiguous, so it resolves to `null` /
 * "unknown" rather than a silent first-match or a fabricated 0 (invariant #6).
 */

import type { Account } from "@/domain/models";

/**
 * The one `type:"current"` account, or `null` when 0 or 2+ exist (ambiguous —
 * never a silent first-match, never a fabricated balance).
 */
export function resolvePrimaryAccount(accounts: Account[]): Account | null {
  const currents = accounts.filter((a) => a.type === "current");
  return currents.length === 1 ? currents[0] : null;
}

/** The resolved current balance, or "unknown" when the account is ambiguous. */
export function resolvePrimaryBalance(accounts: Account[]): number | "unknown" {
  const primary = resolvePrimaryAccount(accounts);
  return primary ? primary.balance : "unknown";
}
