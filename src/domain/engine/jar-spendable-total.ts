/**
 * Σ spendable (`Σ max(0, remaining)`) a jar config would hold, plus the CASA pool —
 * both from the SAME engine path the overview reads (`evaluateJarEnvelope`). This is
 * the BALANCE-lens total the CASA cap (`fitsCasaCap`) compares against CASA, so the
 * write door, the "Chờ phân bổ" card and the Settings limit editor can never
 * disagree (D26, invariant #1). Pure: the caller supplies `accounts`/`txns`/`now`,
 * so the same function runs on the server (node stores) and the client (providers).
 *
 * `spent` is recomputed per config (a category move re-attributes spend), so a move
 * is measured against the mapping it produces.
 */

import type { Account, Jar, JarConfig, Transaction } from "@/domain/models";
import { addMonthsToKey, dateToMonthKey, monthPeriodFromKey, type Amount } from "./types";
import { evaluateJarBudget } from "./jar-budget";
import { rebalanceNetByJar } from "./jar-rebalance";
import { evaluateJarEnvelope } from "./jar-envelope";

export function jarSpendableTotal(
  jars: Jar[],
  accounts: Account[],
  txns: Transaction[],
  now: Date,
): { total: number; pool: Amount } {
  const month = dateToMonthKey(now);
  const period = monthPeriodFromKey(month);
  const prev = monthPeriodFromKey(addMonthsToKey(month, -1));
  const config: JarConfig = { version: 3, jars };
  const rebal = rebalanceNetByJar(txns, period);
  const { lines } = evaluateJarBudget(config, txns, period, prev, now, rebal);
  const spentByJar = new Map(lines.map((l) => [l.huId, l.spent]));
  const env = evaluateJarEnvelope(config, accounts, spentByJar, period, rebal);
  return { total: env.pending.allocated, pool: env.pending.pool };
}
