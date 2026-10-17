import "server-only";

/**
 * Server-side CASA pool for a persona — the authoritative denominator for the
 * jar cap (`fitsCasaCap`). Enforcing Σ spendable (`Σ max(0, balance)`) ≤ CASA on the
 * server (not just the client) is what stops two tabs / a curl from pushing the
 * total over the balance (red-team C2). Checked on create (opening deposit folded
 * in), `/api/jar-ledger` batches, template replace and category moves (they
 * re-attribute spend) — never on a limit edit (a limit is a plan, not money).
 *
 * CASA is now DB-backed (`accounts` table): the pool is the live Σ
 * `availableBalance` of the persona's `current` accounts, so a confirmed
 * transfer that debited an account lowers this denominator too (envelope-label
 * model — spending real money leaves less to allocate). An unknown persona (no
 * `current` account) yields `null` → the caller treats it as "unknown" and the
 * cap blocks (invariant #6: no denominator to validate against).
 */

import { readAccounts } from "@/lib/accounts-store";

/** CASA pool (VND) for `cif`, or `null` when there is no `current` account. */
export function casaPoolForCif(cif: string): number | null {
  const current = readAccounts(cif).filter((account) => account.type === "current");
  if (current.length === 0) return null;
  return current.reduce((sum, account) => sum + account.availableBalance, 0);
}
