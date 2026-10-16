import "server-only";

/**
 * Server-side CASA pool for a persona — the authoritative denominator for the
 * jar cap (`fitsCasaCap`). Enforcing Σ budgetLimit ≤ CASA on the server (not just
 * the client) is what stops two tabs / a curl from pushing the total over the
 * balance (red-team C2). Accounts are pure fixtures (never in sqlite), so the
 * pool is derived deterministically from the persona seed — the SAME formula as
 * the `current` account in `fixtures/generate.ts` (`buildAccounts`): 18tr scaled
 * by `salaryBase / 25tr`. Kept as a tiny standalone constant (rather than
 * generating the whole dataset) so a cap check stays cheap.
 *
 * Transient wallet debits (a jar-sourced transfer) live in client localStorage
 * and only lower the live balance; the server uses the base pool, which is ≥ the
 * client's live pool — so the server never rejects a write the client allowed
 * (it is a backstop against gross violations, not a tighter gate).
 */

import { PERSONA_LIST } from "@/providers/mock/personas";

/** CASA base for the `current` account — mirrors `fixtures/generate.ts` buildAccounts. */
const CASA_BASE_VND = 18_000_000;
const SALARY_REF_VND = 25_000_000;

/**
 * CASA pool (VND) for `cif`, or `null` when the cif is unknown (caller treats
 * `null` as "unknown" → cap blocks, invariant #6 — no denominator to validate).
 */
export function casaPoolForCif(cif: string): number | null {
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return null;
  return Math.round(CASA_BASE_VND * (persona.params.salaryBase / SALARY_REF_VND));
}
