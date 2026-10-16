import { NextRequest, NextResponse } from "next/server";
import { readTransactions } from "@/lib/transactions-store";

/**
 * Bank-provided transaction history for one persona (`cif`), backed by
 * `data/pfm.sqlite3` (see `data/schema.md`). Called by the browser only —
 * `src/providers/mock/mock-provider.ts` is the sole caller (architectural
 * invariant #4). Read-only: nothing here moves money (#3).
 *
 *   GET ?cif=&from=&to= → Transaction[] (newest first; from/to inclusive ISO bounds)
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cif = params.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    const txns = readTransactions(cif, {
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });
    return NextResponse.json(txns);
  } catch (err) {
    console.error("GET /api/transactions failed", err);
    return NextResponse.json({ error: "transactions unavailable" }, { status: 500 });
  }
}
