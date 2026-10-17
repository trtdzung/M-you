/**
 * Test-side stand-in for `/api/corrections` (the real handler sits on the
 * `server-only` SQLite store). Mirrors `corrections-store.ts` rule for rule —
 * `normalize` every record, reject the whole batch on an unknown category id
 * (422), never let a non-user record overwrite a user one — so only the HTTP/DB
 * transport is faked.
 *
 * The valid-id set comes from the taxonomy stub, PER CIF: the taxonomy is stored
 * and writable now, so a correction naming a category the user created a second
 * ago must round-trip, and one naming another persona's category must not.
 */

import { isUserOrigin, normalize, type Correction, type Corrections } from "@/state/corrections-core";
import { mockKnownCategoryIds } from "./mock-categories-fetch";
import { jsonResponse } from "./mock-json-response";

let store: Record<string, Corrections> = {};

function patchCorrections(body: Record<string, unknown> | undefined): Response {
  const cif = body?.cif;
  const changes = body?.changes;
  if (typeof cif !== "string" || !cif) return jsonResponse({ error: "cif is required" }, 422);
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return jsonResponse({ error: "changes must be an object" }, 422);
  }
  const planned: Array<[string, Correction | null]> = [];
  const invalid = new Set<string>();
  const valid = mockKnownCategoryIds(cif);
  for (const [txnId, value] of Object.entries(changes as Record<string, unknown>)) {
    const record = value === null ? null : (normalize({ [txnId]: value })[txnId] ?? null);
    if (record?.categoryId !== undefined && !valid.has(record.categoryId)) invalid.add(record.categoryId);
    planned.push([txnId, record]);
  }
  if (invalid.size > 0) return jsonResponse({ error: "unknown category", invalidCategoryIds: [...invalid] }, 422);

  const next = { ...(store[cif] ?? {}) };
  for (const [txnId, record] of planned) {
    if (record === null) delete next[txnId];
    else if (record.origin === "user" || !isUserOrigin(next[txnId])) next[txnId] = record;
  }
  store[cif] = next;
  return jsonResponse(next);
}

/** Handle `/api/corrections*`; `null` when the URL is something else. */
export function handleCorrectionsRequest(url: string, init?: RequestInit): Response | null {
  const parsed = new URL(url, "http://localhost");
  const method = (init?.method ?? "GET").toUpperCase();
  if (parsed.pathname !== "/api/corrections") return null;
  if (method === "GET") {
    const cif = parsed.searchParams.get("cif");
    if (!cif) return jsonResponse({ error: "cif is required" }, 422);
    return jsonResponse(store[cif] ?? {});
  }
  if (method === "PATCH") {
    return patchCorrections(init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined);
  }
  return jsonResponse({ error: "unhandled" }, 500);
}

/** The stored overlay for `cif` — what the server would now hold. */
export function mockStoredCorrections(cif: string): Corrections {
  return store[cif] ?? {};
}

/**
 * How many stored corrections still point at `categoryId` — the taxonomy stub's
 * DELETE gate. The generated transaction history never carries a CUSTOM category
 * (mock bank data stays on the presets), so the overlay is the only source of
 * usage a deletable category can have.
 */
export function mockCorrectionUsage(cif: string, categoryId: string): number {
  return Object.values(store[cif] ?? {}).filter((c) => c.categoryId === categoryId).length;
}

export function resetMockCorrections(): void {
  store = {};
}
