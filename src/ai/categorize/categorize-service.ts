/**
 * Categorize orchestrator: memory-first → classifier → two-tier validation →
 * confidence gate → chunked. Pure except for the injected `classify` call, so it
 * is fully testable with a fake classifier.
 *
 * Pipeline (per Red Team findings):
 *   1. memory lookup (validated) — a hit never calls the model (#5, cost).
 *   2. remaining → `classify` in chunks ≤ CATEGORIZE_CHUNK_SIZE (#14); one bad
 *      chunk is isolated, the rest still return.
 *   3. TWO-TIER validation of every classifier result:
 *        (a) syntactic — categoryId ∈ taxonomy and not the UNCLASSIFIED sentinel;
 *        (b) semantic  — the category's `kind` must match the txn `type` (#4).
 *      A result failing either tier is DROPPED (the txn stays unclassified — we
 *      never invent a category).
 *   4. gate — confidence ≥ threshold ⇒ applied, else pending (#6, don't count).
 *
 * The service returns overlay `Assignment[]`, never a money figure (invariant #1).
 */

import type { Transaction } from "@/domain/models";
import { CATEGORY_BY_ID, UNCLASSIFIED } from "@/domain/models";
import { isUnclassified } from "@/domain/categorize/unclassified";
import type { Assignment } from "@/state/corrections-core";
import { lookupMemory, type CategoryMemory } from "@/state/category-memory";
import { CATEGORIZE_CHUNK_SIZE, CATEGORIZE_CONFIDENCE_THRESHOLD } from "./config";
import type { ClassifyFn, ClassifyInput, ClassifyOrigin } from "./types";

export interface CategorizeParams {
  txns: Transaction[];
  memory: CategoryMemory;
  classify: ClassifyFn;
  /** Provenance for classifier-produced assignments ("ai" or "heuristic"). */
  classifyOrigin: ClassifyOrigin;
  threshold?: number;
  chunkSize?: number;
}

export interface CategorizeOutcome {
  /** Assignments to upsert into the corrections overlay. */
  assignments: Assignment[];
  /** Stale memory keys (dead ids) the caller should `forget`. */
  deadMemoryKeys: string[];
  /** How many classifier chunks failed (surfaced to the UI). */
  chunkErrors: number;
  /** Counts for the run summary. */
  memoryApplied: number;
  applied: number;
  pending: number;
}

/** The category's kind must match the transaction's type (Red Team #4). */
function kindMatchesType(categoryId: string, txnType: Transaction["type"]): boolean {
  const kind = CATEGORY_BY_ID[categoryId]?.kind;
  if (txnType === "expense") return kind === "expense";
  if (txnType === "income") return kind === "income";
  return false; // transfer / card_payment / fee / refund are never AI-labelled
}

function isValidSuggestion(categoryId: string, txnType: Transaction["type"]): boolean {
  if (categoryId === UNCLASSIFIED || !CATEGORY_BY_ID[categoryId]) return false; // (a) syntactic
  return kindMatchesType(categoryId, txnType); // (b) semantic
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function categorize(params: CategorizeParams): Promise<CategorizeOutcome> {
  const { txns, memory, classify, classifyOrigin } = params;
  const threshold = params.threshold ?? CATEGORIZE_CONFIDENCE_THRESHOLD;
  const chunkSize = Math.max(1, params.chunkSize ?? CATEGORIZE_CHUNK_SIZE);

  // Defense-in-depth: only ever act on AI-eligible unclassified txns.
  const eligible = txns.filter(isUnclassified);
  const byId = new Map(eligible.map((t) => [t.id, t]));

  const assignments: Assignment[] = [];
  const deadMemoryKeys: string[] = [];
  let memoryApplied = 0;

  // 1. memory-first (validated).
  const remaining: Transaction[] = [];
  for (const t of eligible) {
    const merchant = t.merchantNormalizedName || t.merchantName;
    const { categoryId, deadKey } = lookupMemory(memory, merchant);
    if (deadKey) deadMemoryKeys.push(deadKey);
    if (categoryId && kindMatchesType(categoryId, t.type)) {
      assignments.push({ txnId: t.id, categoryId, origin: "memory", status: "applied" });
      memoryApplied++;
    } else {
      remaining.push(t);
    }
  }

  // 2. classifier in isolated chunks.
  let chunkErrors = 0;
  let applied = 0;
  let pending = 0;
  for (const group of chunk(remaining, chunkSize)) {
    const inputs: ClassifyInput[] = group.map((t) => ({
      txnId: t.id,
      merchant: t.merchantNormalizedName || t.merchantName,
      amount: t.amount,
      direction: t.direction,
      type: t.type,
    }));
    let results;
    try {
      results = await classify(inputs);
    } catch {
      chunkErrors++;
      continue; // isolate: this chunk fails, the rest proceed
    }
    for (const r of results) {
      const t = byId.get(r.txnId);
      if (!t) continue; // classifier hallucinated an id — ignore
      // 3. two-tier validation.
      if (!isValidSuggestion(r.categoryId, t.type)) continue;
      // 4. confidence gate.
      const status = r.confidence >= threshold ? "applied" : "pending";
      if (status === "applied") applied++;
      else pending++;
      assignments.push({
        txnId: r.txnId,
        categoryId: r.categoryId,
        origin: classifyOrigin,
        confidence: r.confidence,
        status,
      });
    }
  }

  return { assignments, deadMemoryKeys, chunkErrors, memoryApplied, applied, pending };
}
