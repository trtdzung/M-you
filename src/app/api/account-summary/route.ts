import { NextRequest, NextResponse } from "next/server";
import { accountSummary, type Amount } from "@/domain/engine";
import { readAccounts } from "@/lib/accounts-store";

/**
 * The customer's CASA balance alone, with NO jar computation (see `jar-summary`
 * for that). Split out so a caller that only needs "how much does this customer
 * have" (e.g. the Agent) does not have to read/parse a jars array to get it, and
 * so this number stays available even where jars are irrelevant. Read-only (#3).
 *
 *   GET ?cif= → { casaBalance }
 *
 * `null` when the persona has no `current` account — never a fabricated 0 (#6).
 * `jar-summary` used to also return this figure; it was dropped there on
 * purpose so that response stays jar-only — this is now the ONE place to read
 * the plain CASA balance.
 */

const orNull = (a: Amount): number | null => (a === "unknown" ? null : a);

export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    const { casaBalance } = accountSummary(readAccounts(cif));
    return NextResponse.json({ casaBalance: orNull(casaBalance) });
  } catch (err) {
    console.error("GET /api/account-summary failed", err);
    return NextResponse.json({ error: "account summary unavailable" }, { status: 500 });
  }
}
