import "server-only";

/**
 * Read/append access to the `jar_allocations` table (see
 * `data/jar-allocations/schema.md`). Server only — imported by the route
 * handler under `src/app/api/jar-allocations/`, never by client code
 * (architectural invariant #4).
 *
 * The ledger is append-only: a "Chia ngay" submit writes many rows in ONE
 * transaction (all-or-nothing) so a partial allocation can never be persisted.
 * This store deliberately does NOT credit `jars.actual_amount` — the Overview
 * funded balance is engine-derived from these rows, keeping the ledger the
 * single source of truth (no stored-aggregate drift).
 */

import type { DataSource, JarAllocation } from "@/domain/models";
import type { AllocationInput } from "./jar-allocation-input";
import { getDb } from "./db";

interface AllocationRow {
  id: string;
  cif: string;
  txn_id: string;
  jar_id: string;
  amount: number;
  source: string;
  created_at: string;
}

function toAllocation(row: AllocationRow): JarAllocation {
  return {
    id: row.id,
    txnId: row.txn_id,
    jarId: row.jar_id,
    amount: row.amount,
    source: row.source as DataSource,
    createdAt: row.created_at,
  };
}

/**
 * Point every allocation of `fromJarId` at `toJarId` (used when a jar is deleted
 * so its ledger rows don't linger with a dead `jarId`). Correctness never
 * depends on this — the engine folds an unknown `jarId` into "Khác" regardless —
 * it only keeps the ledger tidy. Returns the persona's updated list.
 */
export function reassignJar(cif: string, fromJarId: string, toJarId: string): JarAllocation[] {
  getDb()
    .prepare("UPDATE jar_allocations SET jar_id = ? WHERE cif = ? AND jar_id = ?")
    .run(toJarId, cif, fromJarId);
  return readAllocations(cif);
}

/** Every allocation for a persona, oldest first (stable FIFO for the split logic). */
export function readAllocations(cif: string): JarAllocation[] {
  const rows = getDb()
    .prepare("SELECT * FROM jar_allocations WHERE cif = ? ORDER BY created_at ASC, id ASC")
    .all(cif) as AllocationRow[];
  return rows.map(toAllocation);
}

/**
 * Append `inputs` for a persona in one transaction and return the full re-read
 * list (so the response is the stored truth). Each row is stamped
 * `source: self_reported` and a fresh id/timestamp. A failed insert rolls the
 * whole batch back.
 */
export function appendAllocations(cif: string, inputs: AllocationInput[]): JarAllocation[] {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO jar_allocations (id, cif, txn_id, jar_id, amount, source, created_at)
     VALUES (@id, @cif, @txnId, @jarId, @amount, @source, @createdAt)`,
  );
  const now = new Date().toISOString();
  const source: DataSource = "self_reported";
  const appendAll = db.transaction((rows: AllocationInput[]) => {
    for (const row of rows) {
      insert.run({
        id: crypto.randomUUID(),
        cif,
        txnId: row.txnId,
        jarId: row.jarId,
        amount: row.amount,
        source,
        createdAt: now,
      });
    }
  });
  appendAll(inputs);
  return readAllocations(cif);
}
