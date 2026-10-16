import { NextRequest, NextResponse } from "next/server";
import { applyCorrectionChanges, MAX_CHANGES, readCorrections } from "@/lib/corrections-store";

/**
 * Per-transaction category overlay for one persona (`cif`), backed by
 * `data/pfm.sqlite3` (see `data/schema.md`). Called by the browser only —
 * `src/state/corrections.tsx` is the sole caller (architectural invariant #4).
 * Labels only: nothing here moves money (#3) or edits the bank row (#4).
 *
 *   GET   ?cif=              → Corrections (txnId → record)
 *   PATCH {cif, changes}     → apply {txnId: record | null} atomically; returns the
 *                              stored overlay (200) / 422 on an unknown category id
 */

export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return NextResponse.json(readCorrections(cif));
  } catch (err) {
    console.error("GET /api/corrections failed", err);
    return NextResponse.json({ error: "corrections unavailable" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { cif, changes } = (body ?? {}) as { cif?: unknown; changes?: unknown };
  if (typeof cif !== "string" || !cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return NextResponse.json({ error: "changes must be an object" }, { status: 422 });
  }
  if (Object.keys(changes).length > MAX_CHANGES) {
    return NextResponse.json({ error: `at most ${MAX_CHANGES} changes per request` }, { status: 413 });
  }
  try {
    const result = applyCorrectionChanges(cif, changes as Record<string, unknown>);
    if (!result.ok) {
      return NextResponse.json({ error: "unknown category", invalidCategoryIds: result.invalidCategoryIds }, { status: 422 });
    }
    return NextResponse.json(result.corrections);
  } catch (err) {
    console.error("PATCH /api/corrections failed", err);
    return NextResponse.json({ error: "corrections write failed" }, { status: 500 });
  }
}
