import { NextRequest, NextResponse } from "next/server";
import { readTransactions } from "@/lib/transactions-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { readCorrections } from "@/lib/corrections-store";
import { applyCorrections, isHidden } from "@/state/corrections-core";

/**
 * Full transaction list for one persona (`cif`) — bank history + self-reported
 * records, with each row's category already resolved through the SAME overlay
 * `jar-summary` and the app's own transaction screen use (`applyCorrections`/
 * `isHidden`, `src/state/corrections-core.ts`): `categoryId` is the customer's
 * CURRENT category (after any manual fix), never the bank's original guess.
 * Read-only (#3) — nothing here moves money or writes a correction.
 *
 *   GET ?cif=&from=&to= → (Transaction & { hidden: boolean })[], newest first
 *
 * `from`/`to` are inclusive ISO bounds on `postedAt`, same convention as
 * `/api/transactions`. Unlike `jar-summary` (which excludes hidden rows from its
 * totals), a row hidden from reports is still INCLUDED here — flagged
 * `hidden: true` — so a caller listing "every transaction" gets the full
 * history rather than a silently shorter one.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cif = params.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  try {
    const corrections = readCorrections(cif);
    const bank = readTransactions(cif, { from, to });
    // readManualTxns has no from/to param (self-reported history is small) — bound it here.
    const manual = readManualTxns(cif).filter(
      (t) => (from === undefined || t.postedAt >= from) && (to === undefined || t.postedAt <= to),
    );
    const merged = applyCorrections([...manual, ...bank], corrections)
      .map((t) => ({ ...t, hidden: isHidden(corrections, t.id) }))
      .sort((a, b) => (a.postedAt < b.postedAt ? 1 : a.postedAt > b.postedAt ? -1 : 0));
    return NextResponse.json(merged);
  } catch (err) {
    console.error("GET /api/transactions-full failed", err);
    return NextResponse.json({ error: "transactions unavailable" }, { status: 500 });
  }
}
