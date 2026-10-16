import { NextRequest, NextResponse } from "next/server";
import type { Transaction } from "@/domain/models";
import {
  readManualTxns,
  upsertManualTxn,
  patchManualTxn,
  deleteManualTxn,
  countRebalanceLegsForJar,
  type ManualTxnPatch,
} from "@/lib/manual-txns-store";

/**
 * Self-reported transactions per persona (`cif`), backed by `data/pfm.sqlite3`
 * (see `data/schema.md`). Called by the browser only — `src/state/manual-txns.tsx`
 * is the sole caller (architectural invariant #4: UI reaches the storage layer
 * only through this route). These records are NOT money movement (#3); the store
 * forces `source: "self_reported"` so a row can never look bank-verified (#5).
 *
 *   GET    ?cif=            → Transaction[] (newest first)
 *   GET    ?cif=&jarId=     → {jarId, rebalanceLegCount} — legs whose rebalance
 *                              from/to is that jar (warn before deleting the jar)
 *   POST   {cif, txn}       → persist one client-built Transaction (201); a
 *                              present `rebalance` must be well-formed (else 422)
 *   PATCH  {cif, id, patch} → merge whitelisted fields (200) / 404 if absent;
 *                              a malformed `rebalance` patch → 422
 *   DELETE ?cif=&id=        → remove one (204)
 */

/** A minimally-valid client Transaction (shape guard; the store is untrusted-input safe). */
function isTxn(v: unknown): v is Transaction {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === "string" && typeof t.postedAt === "string" && typeof t.amount === "number";
}

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v !== "";

/** Shape-guard for the rebalance meta so a malformed object never lands in the store (F15). */
function isRebalanceMeta(v: unknown): v is NonNullable<Transaction["rebalance"]> {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    isNonEmptyString(m.fromJarId) &&
    isNonEmptyString(m.toJarId) &&
    isNonEmptyString(m.triggerTxnId) &&
    (m.origin === "auto" || m.origin === "manual")
  );
}

/** A leg must move a positive, finite amount alongside well-formed meta. */
function isValidRebalanceTxn(txn: Transaction): boolean {
  return isRebalanceMeta(txn.rebalance) && Number.isFinite(txn.amount) && txn.amount > 0;
}

/** The four valid txn statuses — a refund/reversal PATCH must land in this set (H3). */
const TXN_STATUSES: ReadonlySet<string> = new Set(["pending", "posted", "refunded", "reversed"]);

/**
 * Keep only correctly-typed whitelisted fields from an untrusted PATCH body — a
 * mistyped value (e.g. `type: 123`) is dropped rather than written into the JSON
 * payload and silently corrupting the record. `null` is preserved as the CLEAR
 * signal for the optional fields. The `rebalance` meta (Phase 03) must be on the
 * allowlist or a rebalance PATCH would be silently dropped; `status`/`amount`
 * (RT-fix H3/H5) join it so a refund/reversal or amount edit is never dropped.
 */
function sanitizePatch(raw: Record<string, unknown>): ManualTxnPatch {
  const patch: ManualTxnPatch = {};
  if (typeof raw.categoryId === "string") patch.categoryId = raw.categoryId;
  if (typeof raw.type === "string") patch.type = raw.type as Transaction["type"];
  if (raw.transferPurpose === null || typeof raw.transferPurpose === "string")
    patch.transferPurpose = raw.transferPurpose as string | null;
  if (raw.note === null || typeof raw.note === "string") patch.note = raw.note as string | null;
  if (raw.rebalance === null || isRebalanceMeta(raw.rebalance))
    patch.rebalance = raw.rebalance as Transaction["rebalance"] | null;
  if (typeof raw.status === "string" && TXN_STATUSES.has(raw.status))
    patch.status = raw.status as Transaction["status"];
  if (typeof raw.amount === "number" && Number.isFinite(raw.amount) && raw.amount >= 0)
    patch.amount = raw.amount;
  return patch;
}

export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const jarId = req.nextUrl.searchParams.get("jarId");
  if (jarId) return NextResponse.json({ jarId, rebalanceLegCount: countRebalanceLegsForJar(cif, jarId) });
  return NextResponse.json(readManualTxns(cif));
}

export async function POST(req: NextRequest) {
  let body: { cif?: unknown; txn?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { cif, txn } = body;
  if (typeof cif !== "string" || !cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!isTxn(txn)) return NextResponse.json({ error: "txn is invalid" }, { status: 422 });
  if (txn.rebalance !== undefined && !isValidRebalanceTxn(txn)) {
    return NextResponse.json({ error: "rebalance is invalid" }, { status: 422 });
  }
  upsertManualTxn(cif, txn);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  let body: { cif?: unknown; id?: unknown; patch?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { cif, id, patch } = body;
  if (typeof cif !== "string" || !cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "id is required" }, { status: 422 });
  if (!patch || typeof patch !== "object") return NextResponse.json({ error: "patch is required" }, { status: 422 });
  const rawRebalance = (patch as Record<string, unknown>).rebalance;
  if (rawRebalance !== undefined && rawRebalance !== null && !isRebalanceMeta(rawRebalance)) {
    return NextResponse.json({ error: "rebalance is invalid" }, { status: 422 });
  }
  const updated = patchManualTxn(cif, id, sanitizePatch(patch as Record<string, unknown>));
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  const id = req.nextUrl.searchParams.get("id");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 422 });
  deleteManualTxn(cif, id);
  return new NextResponse(null, { status: 204 });
}
