import { NextResponse } from "next/server";
import { invalidExpenseCategoryIds, isReservedJarId } from "@/domain/jar-rules";
import {
  balanceAsOf,
  dateToMonthKey,
  fitsCasaCap,
  jarBalances,
  jarSpendableTotal,
  monthPeriodFromKey,
} from "@/domain/engine";
import type { JarConfig, JarLedgerEntry, Transaction } from "@/domain/models";
import { readAccounts } from "@/lib/accounts-store";
import { readTransactions } from "@/lib/transactions-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { readCorrections } from "@/lib/corrections-store";
import { applyCorrections, isHidden } from "@/state/corrections-core";
import { knownExpenseCategoryIds } from "@/lib/categories-store";

/**
 * Shared write-door checks for the jar routes (`/api/jars*`, `/api/jar-ledger`).
 * Each returns the 4xx response to send, or `null` when the write may proceed —
 * so every door rejects bad input the same way instead of silently ignoring it.
 * Every clock-dependent check takes `now` from its caller (`transferNow()`, the
 * SAME clock that stamps ledger rows — Red Team #1), never a module constant.
 */

function unprocessable(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status: 422 });
}

/**
 * The persona's live txns (self-reported + bank) the balance lens folds over,
 * with the user's category corrections applied and hidden txns dropped — the
 * SAME view `jar-summary` and `useFinancials` render, so a withdraw/cap check
 * judges the balance the user actually sees (invariant #1).
 */
export function liveTxns(cif: string): Transaction[] {
  const corrections = readCorrections(cif);
  return applyCorrections([...readManualTxns(cif), ...readTransactions(cif)], corrections).filter(
    (t) => !isHidden(corrections, t.id),
  );
}

/**
 * CASA cap (S4/S5), BALANCE LENS: reject only when the write RAISES Σ spendable
 * (`Σ max(0, balance)`) past the persona's live CASA pool. `next` and `base` are
 * WHOLE configs (jars + ledger) — the caller folds any not-yet-written ledger
 * rows into `next` (Red Team #3) — so lowering / clearing / re-saving always
 * passes, even over cap or with CASA < 0. Unknown CASA blocks increases only
 * (`overBy: null`). Shares `jarSpendableTotal` with the overview and the
 * allocation sheet, so client preview and server never diverge.
 */
export function capViolation(cif: string, next: JarConfig, base: JarConfig, now: Date): NextResponse | null {
  const accounts = readAccounts(cif);
  const txns = liveTxns(cif);
  const nextTotal = jarSpendableTotal(next, accounts, txns, now);
  const baseTotal = jarSpendableTotal(base, accounts, txns, now);
  const cap = fitsCasaCap(nextTotal.total, baseTotal.total, nextTotal.pool);
  return cap.ok ? null : unprocessable({ error: "over CASA cap", overBy: cap.overBy ?? null });
}

/**
 * Per-entry checks for a ledger batch, in order: the jar must exist in the
 * config (404) and have a real DB row (422 — the synthetic "Khác", Red Team #5);
 * a withdraw may never touch an unfunded (`null`) jar or push a balance below 0
 * (422 `over balance` + `maxWithdraw`, `null` when the balance is unknown).
 * Balances are re-derived by the engine over the ledger AS APPLIED SO FAR, so a
 * deposit earlier in the same batch funds a later withdraw (redistribution).
 */
export function ledgerBatchViolation(
  cif: string,
  config: JarConfig,
  rowIds: ReadonlySet<string>,
  entries: JarLedgerEntry[],
  now: Date,
): NextResponse | null {
  const known = new Set(config.jars.map((j) => j.id));
  for (const e of entries) {
    if (!known.has(e.jarId)) return NextResponse.json({ error: "jar not found", jarId: e.jarId }, { status: 404 });
    if (!rowIds.has(e.jarId)) return unprocessable({ error: "jar not persisted", jarId: e.jarId });
  }
  const txns = liveTxns(cif);
  const period = monthPeriodFromKey(dateToMonthKey(now));
  const asOf = balanceAsOf(period, now);
  const applied = [...(config.ledger ?? [])];
  for (const e of entries) {
    if (e.kind === "withdraw") {
      const balance = jarBalances({ ...config, ledger: applied }, txns, asOf, period.to).get(e.jarId)?.balance ?? null;
      if (balance === null || balance < e.amount) {
        return unprocessable({
          error: "over balance",
          jarId: e.jarId,
          maxWithdraw: balance === null ? null : Math.max(0, balance),
        });
      }
    }
    applied.push(e);
  }
  return null;
}

/** Sentinel ids (S9): `pool`/`unclassified`/`dieu-chinh-hu` always; `khac` when creating. */
export function reservedIdViolation(ids: string[], creating: boolean): NextResponse | null {
  const reserved = ids.find((id) => isReservedJarId(id, creating));
  return reserved === undefined ? null : unprocessable({ error: `jar id ${reserved} is reserved` });
}

/**
 * Every category id must be an expense category of THIS PERSONA's stored
 * taxonomy (A11/A49) — `knownExpenseCategoryIds`, not the bundled constant, so a
 * category the user created a moment ago is assignable immediately and persona
 * A's custom id can never validate for persona B. Archived ids are included: a
 * jar PATCH sends the jar's full `categoryIds`, so a jar that already holds an
 * archived category must still be saveable.
 */
export function categoryViolation(cif: string, catIds: readonly string[]): NextResponse | null {
  const invalid = invalidExpenseCategoryIds(catIds, knownExpenseCategoryIds(cif));
  return invalid.length === 0
    ? null
    : unprocessable({ error: "categoryIds must be expense categories", invalid });
}
