import "server-only";

/** Test tools: the "đã hiện" marks the frequency rules read, and how to forget them. */

import { getDb } from "@/lib/db";
import { clearInterventions, type StoredContext } from "./intervention-store";

export type FrequencyMark = { id: string; scenario: string; at: number; key: string | null };

function keyOf(context: string): string | null {
  try {
    const parsed = JSON.parse(context) as StoredContext;
    return typeof parsed.key === "string" ? parsed.key : null;
  } catch {
    return null;
  }
}

/** Pending, shown, or answered — the same rows `shownHistory` feeds the frequency rules. */
export function listFrequencyMarks(cif: string): FrequencyMark[] {
  const rows = getDb()
    .prepare("SELECT id, scenario, context, COALESCE(shown_at, created_at) AS at FROM interventions WHERE cif = ? AND status IN ('pending', 'shown', 'answered') ORDER BY at, rowid")
    .all(cif) as { id: string; scenario: string; context: string; at: number }[];
  return rows.map(row => ({ id: row.id, scenario: row.scenario, at: row.at, key: keyOf(row.context) }));
}

/** Drops one mark. Returns false when that id is not a frequency row of this persona. */
export function deleteFrequencyMark(cif: string, id: string): boolean {
  const { changes } = getDb()
    .prepare("DELETE FROM interventions WHERE cif = ? AND id = ? AND status IN ('pending', 'shown', 'answered')")
    .run(cif, id);
  return changes > 0;
}

export function clearFrequency(cif: string): void {
  clearInterventions(cif);
}
