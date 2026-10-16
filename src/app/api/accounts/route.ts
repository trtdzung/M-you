import { NextRequest, NextResponse } from "next/server";
import { readAccounts } from "@/lib/accounts-store";

/**
 * Bank accounts for one persona (`cif`), backed by `data/pfm.sqlite3` (see
 * `data/schema.md`). Called by the browser only — `src/providers/mock/mock-provider.ts`
 * is the sole caller (architectural invariant #4). Debits go through the sibling
 * `/api/accounts/debit` route.
 */

/** GET /api/accounts?cif= — the persona's accounts, in display order. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  return NextResponse.json(readAccounts(cif));
}
