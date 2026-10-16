import { NextRequest, NextResponse } from "next/server";
import { sanitizeAllocationInputs } from "@/lib/jar-allocation-input";
import { appendAllocations, readAllocations } from "@/lib/jar-allocations-store";

/**
 * Envelope allocations ("phân bổ thu nhập vào hũ") for one persona (`cif`),
 * backed by `data/pfm.sqlite3` (see `data/jar-allocations/schema.md`).
 *
 * Called by the browser only — `src/providers/mock/mock-provider.ts` is the
 * sole caller (architectural invariant #4). This route records bookkeeping of
 * money already received; it moves no real money (invariant #3).
 *
 * It does NOT validate that `txnId` is a real in-scope income transaction —
 * transactions are provider data, not rows in this DB. The engine is the
 * authority (invariant #1): an allocation to a fabricated/non-income txn is
 * simply inert (see `jar-envelope.ts`).
 */

function missingCif() {
  return NextResponse.json({ error: "cif is required" }, { status: 422 });
}

/** GET /api/jar-allocations?cif= — the persona's allocations, oldest first. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return missingCif();
  return NextResponse.json(readAllocations(cif));
}

/**
 * POST /api/jar-allocations — append a batch (body `{cif, allocations}`). The
 * whole batch is rejected (422) if the list is absent/empty or any element is
 * malformed, so a partial write never happens.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return missingCif();
  const inputs = sanitizeAllocationInputs(body?.allocations);
  if (!inputs) return NextResponse.json({ error: "allocations is invalid" }, { status: 422 });
  return NextResponse.json(appendAllocations(cif, inputs), { status: 201 });
}
