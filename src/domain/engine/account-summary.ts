/**
 * A persona's CASA balance, independent of jars — for surfaces that need "how
 * much does this customer have in their payment account" without any jar
 * computation (e.g. `GET /api/account-summary`). Same number `casaBalance()`
 * (`./casa-balance.ts`) computes; kept as its own tiny module so a caller that
 * wants this without pulling in the jar engine can import just this.
 */

import type { Account } from "@/domain/models";
import { UNKNOWN, type Amount } from "./types";

export interface AccountSummary {
  /** Σ `availableBalance` of `type: "current"` accounts; "unknown" when there is none (invariant #6). */
  casaBalance: Amount;
}

export function accountSummary(accounts: readonly Account[]): AccountSummary {
  return {
    casaBalance: accounts.some((a) => a.type === "current")
      ? accounts.reduce((sum, a) => (a.type === "current" ? sum + a.availableBalance : sum), 0)
      : UNKNOWN,
  };
}
