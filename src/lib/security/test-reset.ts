import "server-only";

/**
 * Test tools "Đặt lại": wipe one persona's engine rows and the simulated
 * ledger rows this panel wrote (credit- / fd- / sim-). Seed history stays.
 */

import { getDb } from "@/lib/db";
import { writeEngineClock } from "./clock";
import { clearEvents } from "./events";
import { clearInterventions } from "./intervention-store";

type StoredTxn = { accountId?: string; amount?: number; direction?: string };

export function resetPersonaEngine(cif: string): void {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, payload FROM transactions WHERE cif = ? AND (id LIKE 'credit-%' OR id LIKE 'fd-%' OR id LIKE 'sim-%')",
  ).all(cif) as { id: string; payload: string }[];
  const revert = db.prepare("UPDATE accounts SET balance = MAX(0, balance + @delta), available_balance = MAX(0, available_balance + @delta) WHERE cif = @cif AND id = @id");
  const remove = db.prepare("DELETE FROM transactions WHERE cif = ? AND id = ?");
  db.transaction(() => {
    for (const row of rows) {
      try {
        const txn = JSON.parse(row.payload) as StoredTxn;
        if (txn.accountId && typeof txn.amount === "number" && Number.isFinite(txn.amount)) {
          const delta = txn.direction === "credit" ? -txn.amount : txn.amount;
          revert.run({ cif, id: txn.accountId, delta });
        }
      } catch {
        // still drop the row
      }
      remove.run(cif, row.id);
    }
    clearEvents(cif);
    clearInterventions(cif);
    db.prepare("DELETE FROM transfer_holds WHERE cif = ?").run(cif);
    db.prepare("DELETE FROM fraud_cases WHERE cif = ?").run(cif);
    db.prepare("DELETE FROM ai_journal WHERE cif = ?").run(cif);
    writeEngineClock(cif, { offsetMs: 0, alertHour: null, accountOpenedAt: null, skipHold: false });
  })();
}
