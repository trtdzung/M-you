import "server-only";

/** Write and read the Scam Shield event log (`security_events`). Server only. */

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { engineNow } from "./clock";
import type { SecurityEvent, SecurityEventPayloads, SecurityEventType } from "./event-types";

interface Row {
  id: string;
  cif: string;
  type: SecurityEventType;
  at: number;
  payload: string;
}

function toEvent(row: Row): SecurityEvent | null {
  try {
    return { id: row.id, cif: row.cif, type: row.type, at: row.at, payload: JSON.parse(row.payload) };
  } catch {
    return null;
  }
}

/** Append one event, stamped with the engine clock unless `at` is given. */
export function recordEvent<T extends SecurityEventType>(cif: string, type: T, payload: SecurityEventPayloads[T], at?: number): SecurityEvent<T> {
  const event: SecurityEvent<T> = { id: randomUUID(), cif, type, at: at ?? engineNow(cif).getTime(), payload };
  getDb()
    .prepare("INSERT INTO security_events (id, cif, type, at, payload) VALUES (?, ?, ?, ?, ?)")
    .run(event.id, cif, type, event.at, JSON.stringify(payload));
  return event;
}

/** Events at or after `sinceMs`, oldest first; optionally only some types. */
export function eventsSince(cif: string, sinceMs: number, types?: readonly SecurityEventType[]): SecurityEvent[] {
  const filter = types?.length ? ` AND type IN (${types.map(() => "?").join(", ")})` : "";
  const rows = getDb()
    .prepare(`SELECT id, cif, type, at, payload FROM security_events WHERE cif = ? AND at >= ?${filter} ORDER BY at, rowid`)
    .all(cif, sinceMs, ...(types ?? [])) as Row[];
  return rows.map(toEvent).filter((event): event is SecurityEvent => event !== null);
}

/** Remove every event of a persona (test tools "reset"). */
export function clearEvents(cif: string): void {
  getDb().prepare("DELETE FROM security_events WHERE cif = ?").run(cif);
}
