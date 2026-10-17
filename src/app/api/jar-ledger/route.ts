import { NextRequest, NextResponse } from "next/server";
import type { JarLedgerEntry } from "@/domain/models";
import { transferNow } from "@/lib/demo-clock";
import { appendJarLedger, ledgerEntryId, sanitizeLedgerBatch } from "@/lib/jar-ledger-store";
import { readJarConfig, readJarRowIds } from "@/lib/jars-store";
import { capViolation, ledgerBatchViolation } from "../jars/jar-write-guards";

/**
 * POST /api/jar-ledger — the ONE door for every jar deposit / withdraw (plan
 * 260923 D4, Red Team #9). Body `{cif, entries: [{jarId, kind, amount}]}`.
 *
 * The ledger is a display partition of CASA — nothing here moves money
 * (invariant #3); every row is `self_reported` (#5). Ids, timestamps and
 * `is_opening` are server-minted, on the SAME clock (`transferNow()`) the balance
 * reads use, so a just-written row is always visible (Red Team #1).
 *
 *  - 422: missing `cif`; bad `entries` (not 1–50, bad kind, amount not a whole
 *    VND in (0, 10^12], Σ amount > 10^12); a jar with no DB row (the synthetic
 *    "Khác", Red Team #5); a withdraw over a jar's balance or on an unfunded jar
 *    (`over balance` + `maxWithdraw`); a batch raising Σ spendable past CASA
 *    (`over CASA cap` + `overBy`, checked ONCE on the whole batch, so a
 *    redistribution — withdraw A, deposit B — passes when its net fits).
 *  - 404: an unknown `jarId` (`{jarId}`).
 *  - 201: ALL entries written in one SQLite transaction → the full `JarConfig`.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const batch = sanitizeLedgerBatch(body?.entries);
  if (!batch) return NextResponse.json({ error: "entries is invalid" }, { status: 422 });

  const now = transferNow();
  const createdAt = now.toISOString();
  const entries: JarLedgerEntry[] = batch.map((e, i) => ({
    id: ledgerEntryId(now, i),
    jarId: e.jarId,
    kind: e.kind,
    amount: e.amount,
    isOpening: false,
    createdAt,
    source: "self_reported",
  }));

  try {
    const config = readJarConfig(cif);
    const rejected =
      ledgerBatchViolation(cif, config, readJarRowIds(cif), entries, now) ??
      capViolation(cif, { ...config, ledger: [...(config.ledger ?? []), ...entries] }, config, now);
    if (rejected) return rejected;

    appendJarLedger(cif, entries); // atomic: one transaction, all-or-nothing
    return NextResponse.json(readJarConfig(cif), { status: 201 });
  } catch (err) {
    console.error("POST /api/jar-ledger failed", err);
    return NextResponse.json({ error: "jar ledger write failed" }, { status: 500 });
  }
}
