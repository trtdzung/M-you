import { NextResponse } from "next/server";
import type { Transaction } from "@/domain/models";
import {
  balanceAsOf,
  casaBalance,
  computeUnallocatedPool,
  dateToMonthKey,
  jarBalances,
  jarSpendable,
  monthPeriodFromKey,
  POOL_DONOR_ID,
} from "@/domain/engine";
import { liveTxns } from "@/app/api/jars/jar-write-guards";
import { readAccounts } from "@/lib/accounts-store";
import { readJarConfig } from "@/lib/jars-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { readTransactions } from "@/lib/transactions-store";
import { transferNow } from "@/lib/demo-clock";

/**
 * Server-side consistency guard for one `dieu-chinh-hu` rebalance leg (plan
 * 260923 Phase 04). Without it a hand-crafted POST could credit a jar from a jar
 * that does not exist (the engine skips unknown jar ids) — balance out of thin
 * air, breaking `pool + Σ spendable = CASA`. Returns the 4xx to send, or `null`.
 *
 *  1. Every leg: `fromJarId ≠ toJarId` (422); each non-pool end is a configured jar (404).
 *  2. Only a leg whose `triggerTxnId` is NOT a real txn of this cif — a
 *     user-made re-split (`jar-transfer-…` from the overview sheet, `agent-…`
 *     from the agent card) — is capped: the source gives at most
 *     `max(0, balance)` (pool: `max(0, unallocated)`), and a jar with no balance
 *     (`null`) can neither give nor receive. Balances are re-derived as of the
 *     leg's own `postedAt`, the same instant the client snapshot used.
 *  3. A leg triggered by a real txn (auto-fund waterfall, reconcile) is never
 *     capped — those flows delete-then-rewrite with category overrides the server
 *     has not seen yet, and a false reject there would strand the cover.
 *
 * Consistency only, not authz: `cif` is client-sent (known prototype limitation).
 */
export function rebalanceLegViolation(cif: string, txn: Transaction): NextResponse | null {
  const leg = txn.rebalance;
  if (!leg) return null;
  if (leg.fromJarId === leg.toJarId) return unprocessable({ error: "rebalance from/to must differ" });

  const config = readJarConfig(cif);
  const known = new Set(config.jars.map((j) => j.id));
  for (const jarId of [leg.fromJarId, leg.toJarId]) {
    if (jarId !== POOL_DONOR_ID && !known.has(jarId)) {
      return NextResponse.json({ error: "jar not found", jarId }, { status: 404 });
    }
  }

  const realIds = new Set([...readManualTxns(cif), ...readTransactions(cif)].map((t) => t.id));
  if (realIds.has(leg.triggerTxnId)) return null;

  // The leg itself (a re-POST / PATCH of the same id) must not count toward its own cap.
  const txns = liveTxns(cif).filter((t) => t.id !== txn.id);
  const now = transferNow();
  const period = monthPeriodFromKey(dateToMonthKey(new Date(txn.postedAt), now));
  const asOf = Number.isFinite(Date.parse(txn.postedAt)) ? new Date(txn.postedAt).toISOString() : balanceAsOf(period, now);
  const balances = jarBalances(config, txns, asOf, period.to);
  const balanceOf = (jarId: string) => balances.get(jarId)?.balance ?? null;

  if (leg.toJarId !== POOL_DONOR_ID && balanceOf(leg.toJarId) === null) {
    return unprocessable({ error: "jar has no balance", jarId: leg.toJarId });
  }

  let max: number;
  if (leg.fromJarId === POOL_DONOR_ID) {
    const spendableTotal = config.jars.reduce((sum, j) => sum + (jarSpendable(balanceOf(j.id)) ?? 0), 0);
    max = Math.max(0, computeUnallocatedPool({ casaBalance: casaBalance(readAccounts(cif)), spendableTotal }).amount);
  } else {
    const balance = balanceOf(leg.fromJarId);
    if (balance === null) return unprocessable({ error: "jar has no balance", jarId: leg.fromJarId });
    max = Math.max(0, balance);
  }
  return txn.amount > max ? unprocessable({ error: "over balance", jarId: leg.fromJarId, max }) : null;
}

function unprocessable(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status: 422 });
}
