import { NextRequest, NextResponse } from "next/server";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { jarSpendable } from "@/domain/engine";
import type { Amount } from "@/domain/engine/types";
import { currentMonthKey } from "@/lib/demo-clock";
import { readAccounts } from "@/lib/accounts-store";
import { readCorrections } from "@/lib/corrections-store";
import { readJarConfig } from "@/lib/jars-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { readTransactions } from "@/lib/transactions-store";
import { applyCorrections, isHidden } from "@/state/corrections-core";

/**
 * Per-jar figures for one persona (`cif`) and month, computed by the SAME pure
 * engine the app screens use (`computeFinancials`) — so an Agent reading this
 * sees exactly what the customer sees, instead of re-deriving it from raw
 * transactions. Read-only: nothing here moves money (#3). The Agent only reads
 * this to PROPOSE a jar change; `pfm` performs it after the customer confirms.
 *
 *   GET ?cif=&month=YYYY-MM → { month, unallocated, allocationHeadroom, jars[] }
 *
 * `month` defaults to the demo clock's current month. Money-in-account figures
 * are `null` when the persona has no `current` account (unknown, never a fake 0 — #6).
 *
 * The plain CASA balance (no jar computation) lives at `GET /api/account-summary`
 * instead — it was dropped from here on purpose so this response stays jar-only;
 * a caller wanting both calls both.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const orNull = (a: Amount): number | null => (a === "unknown" ? null : a);

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cif = params.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const month = params.get("month") ?? currentMonthKey();
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 422 });

  try {
    const jarConfig = readJarConfig(cif);
    const accounts = readAccounts(cif);
    const corrections = readCorrections(cif);
    // Same view the client builds: bank + self-reported txns, category corrections
    // applied, hidden rows excluded from the engine.
    const transactions = applyCorrections([...readManualTxns(cif), ...readTransactions(cif)], corrections).filter(
      (t) => !isHidden(corrections, t.id),
    );
    const raw: RawData = {
      transactions,
      accounts,
      assets: [],
      liabilities: [],
      budgets: [],
      snapshots: [],
      goals: [],
      products: [],
    };
    const fin = computeFinancials(raw, month, { transactions, jarConfig });
    const jarById = new Map(jarConfig.jars.map((j) => [j.id, j]));

    const jars = fin.jarEnvelope.jars.map((line) => {
      const jar = jarById.get(line.jarId);
      return {
        id: line.jarId,
        label: line.label,
        categoryIds: jar?.categoryIds ?? [],
        budgetLimit: line.budgetLimit,
        spent: line.spent,
        remaining: line.remaining,
        spendable: jarSpendable(line.remaining),
        overLimit: line.overLimit,
      };
    });

    return NextResponse.json({
      month,
      unallocated: orNull(fin.unallocatedPool.amount),
      allocationHeadroom: orNull(fin.jarEnvelope.pending.amount),
      jars,
    });
  } catch (err) {
    console.error("GET /api/jar-summary failed", err);
    return NextResponse.json({ error: "jar summary unavailable" }, { status: 500 });
  }
}
