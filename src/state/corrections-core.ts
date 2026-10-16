/**
 * Pure (React-free) core of the corrections overlay — the single txn-keyed
 * overlay that carries BOTH user corrections and AI/memory/heuristic assignments
 * (Red Team #7: no duplicate stores). Kept separate from the provider so every
 * guard here is unit-testable without rendering.
 *
 * Invariants enforced here:
 *  - #4 never mutates provider data — resolution returns new txn objects.
 *  - #6 a `pending` assignment does NOT change the effective category (the txn
 *    stays UNCLASSIFIED for the engine, so it is not counted until confirmed);
 *    an assignment pointing at an id no longer in the taxonomy falls back to the
 *    original category and is NEVER dropped.
 *  - #5 provenance (`origin`/`confidence`) is preserved on every record.
 *  - Race (Red Team #6): a `user`-origin record is never overwritten by an
 *    AI/memory/heuristic assignment.
 */

import type { Transaction } from "@/domain/models";
import { CATEGORY_BY_ID } from "@/domain/models";

/** Where a category override came from. Absent ⇒ legacy user correction. */
export type CorrectionOrigin = "user" | "ai" | "memory" | "heuristic";

/** One transaction's overrides. Absent fields mean "no override". */
export interface Correction {
  categoryId?: string;
  hidden?: boolean;
  /** Absent ⇒ "user" (a pre-feature correction). */
  origin?: CorrectionOrigin;
  /** Only meaningful for non-user origins; drives the applied/pending gate. */
  confidence?: number;
  /** Absent ⇒ "applied". A "pending" record does not change the category. */
  status?: "applied" | "pending";
}
export type Corrections = Record<string, Correction>; // txnId -> overrides

/** A non-user category assignment produced by the classify pipeline. */
export interface Assignment {
  txnId: string;
  categoryId: string;
  origin: "ai" | "memory" | "heuristic";
  confidence?: number;
  status: "applied" | "pending";
}

/**
 * True for a user-authored CATEGORY choice (explicit or legacy default). A
 * hidden-only record (no category) is not protected — an AI assignment may add a
 * category to it while its hidden flag is preserved.
 */
export function isUserOrigin(c: Correction | undefined): boolean {
  return c !== undefined && c.categoryId !== undefined && (c.origin === undefined || c.origin === "user");
}

/**
 * Migrate stored data to the current shape. Handles the legacy flat
 * `txnId -> categoryId` string map AND older `{categoryId, hidden}` records,
 * defaulting `origin:"user", status:"applied"` so shipped corrections keep
 * winning over any later AI assignment.
 */
export function normalize(parsed: unknown): Corrections {
  if (!parsed || typeof parsed !== "object") return {};
  const out: Corrections = {};
  for (const [txnId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string") {
      out[txnId] = { categoryId: value, origin: "user", status: "applied" };
    } else if (value && typeof value === "object") {
      const v = value as Correction;
      const rec: Correction = {};
      if (typeof v.categoryId === "string") rec.categoryId = v.categoryId;
      if (v.hidden === true) rec.hidden = true;
      if (v.origin === "ai" || v.origin === "memory" || v.origin === "heuristic") rec.origin = v.origin;
      else rec.origin = "user";
      if (typeof v.confidence === "number" && rec.origin !== "user") rec.confidence = v.confidence;
      rec.status = v.status === "pending" ? "pending" : "applied";
      if (rec.categoryId !== undefined || rec.hidden) out[txnId] = rec;
    }
  }
  return out;
}

/** Drop status/confidence noise from a record that has no category override. */
function tidy(rec: Correction): Correction {
  const out: Correction = {};
  if (rec.categoryId !== undefined) {
    out.categoryId = rec.categoryId;
    out.origin = rec.origin ?? "user";
    if (out.origin !== "user" && typeof rec.confidence === "number") out.confidence = rec.confidence;
    if (rec.status === "pending") out.status = "pending";
  }
  if (rec.hidden === true) out.hidden = true;
  return out;
}

/** Apply a patch to one txn's record; drop the key when nothing is left. */
export function patch(prev: Corrections, txnId: string, change: Partial<Correction>): Corrections {
  const merged = tidy({ ...prev[txnId], ...change });
  const next = { ...prev };
  if (merged.categoryId === undefined && merged.hidden !== true) delete next[txnId];
  else next[txnId] = merged;
  return next;
}

/**
 * Merge classify-pipeline assignments in, honouring the race guard: a txn whose
 * current record is user-authored is never overwritten (Red Team #6). A hidden
 * flag on the existing record is preserved.
 */
export function mergeAssignments(prev: Corrections, assignments: Assignment[]): Corrections {
  if (assignments.length === 0) return prev;
  const next = { ...prev };
  for (const a of assignments) {
    if (isUserOrigin(next[a.txnId])) continue; // user wins — never clobber
    const rec: Correction = {
      categoryId: a.categoryId,
      origin: a.origin,
      status: a.status,
    };
    if (typeof a.confidence === "number") rec.confidence = a.confidence;
    if (next[a.txnId]?.hidden === true) rec.hidden = true;
    next[a.txnId] = rec;
  }
  return next;
}

/** Promote a txn's category to a confirmed user correction (accept/correct). */
export function promoteToUser(prev: Corrections, txnId: string, categoryId: string): Corrections {
  return patch(prev, txnId, { categoryId, origin: "user", status: "applied", confidence: undefined });
}

/** Whether a transaction is hidden from spend/report totals. */
export function isHidden(corrections: Corrections, txnId: string): boolean {
  return corrections[txnId]?.hidden === true;
}

/**
 * Resolve one transaction's effective category from its correction (pure).
 *  - a `pending` assignment leaves the category untouched (engine still treats
 *    the txn as unclassified — invariant #6);
 *  - an override pointing at an id no longer in the taxonomy falls back to the
 *    original category (never dropped, never thrown — invariant #6);
 *  - otherwise the override wins, flagging `userEdited` only for user origin.
 */
export function resolveEffective(txn: Transaction, c: Correction | undefined): Transaction {
  if (!c || c.status === "pending" || c.categoryId === undefined) return txn;
  if (!CATEGORY_BY_ID[c.categoryId]) return txn; // orphaned id ⇒ keep original
  if (c.categoryId === txn.categoryId) return txn;
  const userEdited = c.origin === undefined || c.origin === "user" || txn.userEdited;
  return { ...txn, categoryId: c.categoryId, userEdited };
}

/**
 * Merge category corrections onto transactions (pure). Does NOT drop hidden
 * rows — the caller (`useFinancials`) applies that exclusion so the list can
 * still show hidden rows while the engine array excludes them.
 */
export function applyCorrections(txns: Transaction[], corrections: Corrections): Transaction[] {
  if (Object.keys(corrections).length === 0) return txns;
  return txns.map((t) => resolveEffective(t, corrections[t.id]));
}
