/**
 * Σ spendable (`Σ max(0, balance)`) a jar config would hold, plus the CASA pool —
 * both from the SAME engine path the overview reads (`jarBalances` →
 * `evaluateJarEnvelope`). This is the BALANCE-lens total the CASA cap
 * (`fitsCasaCap`) compares against CASA, so the write door, the "Chờ phân bổ" card
 * and the Settings editor can never disagree (D26, invariant #1). Pure: the caller
 * supplies the whole `config` (jars + ledger), `accounts`, `txns` and `now` — the
 * ONE injected clock (`transferNow()` on real paths) that also stamps ledger rows,
 * so a just-written row is always counted. Runs on the server and the client alike.
 *
 * Spend since each jar's anchor is recomputed per config (a category move
 * re-attributes spend), so a move is measured against the mapping it produces.
 */

import type { Account, JarConfig, Transaction } from "@/domain/models";
import { dateToMonthKey, monthPeriodFromKey, type Amount } from "./types";
import { balanceAsOf, jarBalances } from "./jar-balance";
import { evaluateJarEnvelope } from "./jar-envelope";

export function jarSpendableTotal(
  config: JarConfig,
  accounts: Account[],
  txns: Transaction[],
  now: Date,
): { total: number; pool: Amount } {
  const period = monthPeriodFromKey(dateToMonthKey(now));
  const balances = jarBalances(config, txns, balanceAsOf(period, now), period.to);
  // `allocated` reads only the balance lens; the period `spent` (limit axis) does
  // not enter it, so no per-jar spend map is needed here.
  const env = evaluateJarEnvelope(config, accounts, new Map(), period, balances);
  return { total: env.pending.allocated, pool: env.pending.pool };
}
