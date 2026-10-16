/**
 * Test-side stand-in for `/api/corrections` + `/api/categories` (the real
 * handlers sit on the `server-only` SQLite stores). Mirrors
 * `corrections-store.ts` rule for rule — `normalize` every record, reject the
 * whole batch on an unknown category id (422), never let a non-user record
 * overwrite a user one — so only the HTTP/DB transport is faked.
 */

import { CATEGORIES } from "@/domain/models";
import { isUserOrigin, normalize, type Correction, type Corrections } from "@/state/corrections-core";

let store: Record<string, Corrections> = {};
const VALID = new Set(CATEGORIES.map((c) => c.id));

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function patchCorrections(body: Record<string, unknown> | undefined): Response {
  const cif = body?.cif;
  const changes = body?.changes;
  if (typeof cif !== "string" || !cif) return jsonResponse({ error: "cif is required" }, 422);
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return jsonResponse({ error: "changes must be an object" }, 422);
  }
  const planned: Array<[string, Correction | null]> = [];
  const invalid = new Set<string>();
  for (const [txnId, value] of Object.entries(changes as Record<string, unknown>)) {
    const record = value === null ? null : (normalize({ [txnId]: value })[txnId] ?? null);
    if (record?.categoryId !== undefined && !VALID.has(record.categoryId)) invalid.add(record.categoryId);
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

/** Handle `/api/corrections*` and `/api/categories*`; `null` when the URL is neither. */
export function handleCorrectionsRequest(url: string, init?: RequestInit): Response | null {
  const parsed = new URL(url, "http://localhost");
  const method = (init?.method ?? "GET").toUpperCase();
  if (parsed.pathname === "/api/categories") {
    return method === "GET" ? jsonResponse(CATEGORIES) : jsonResponse({ error: "unhandled" }, 500);
  }
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

export function resetMockCorrections(): void {
  store = {};
}
