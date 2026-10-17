/**
 * Test-side mirror of the `/api/jars*` route handlers for `mock-jars-fetch.ts`:
 * GET/POST/PUT `/api/jars`, PATCH/DELETE `/api/jars/:id` and
 * POST `/api/jars/:id/categories`. Each branch runs the same `@/domain/jar-rules`
 * calls as its real handler (incl. the 404-on-unknown-id guards and the balance-
 * lens CASA cap); the in-memory store, its normalizing commit point and the cap
 * live behind `JarsPorts`, so only the HTTP/DB transport is faked.
 */

import { isJarAmount, stripCategories, uniqueJarId } from "@/domain/jar-rules";
import type { Jar, JarConfig, JarLedgerEntry } from "@/domain/models";
import { transferNow } from "@/lib/demo-clock";
import { jsonResponse } from "./mock-json-response";

export interface JarsPorts {
  readConfig: () => JarConfig;
  /** Normalize + store (`write = false` for a GET: nothing is persisted). */
  commit: (next: JarConfig, cif: string | null, write?: boolean) => JarConfig;
  /** The shared cap rule: a 422 response, or `null` when `next` fits. */
  overCap: (next: JarConfig, cif: string | null) => Response | null;
}

function handleCollection(method: string, body: Record<string, unknown> | undefined, cif: string | null, ports: JarsPorts): Response {
  const store = ports.readConfig();
  if (method === "GET") return jsonResponse(ports.commit(store, cif, false));
  if (method === "POST") {
    // The opening `balance` is required (0 allowed); `jar.budgetLimit` is optional — absent = "chưa đặt".
    const jar = body?.jar as Jar | undefined;
    if (!jar || typeof jar.id !== "string" || !Array.isArray(jar.categoryIds)) {
      return jsonResponse({ error: "jar is invalid" }, 422);
    }
    if (jar.budgetLimit !== undefined && jar.budgetLimit !== null && !isJarAmount(jar.budgetLimit)) {
      return jsonResponse({ error: "jar is invalid" }, 422);
    }
    if (!isJarAmount(body?.balance)) {
      return jsonResponse({ error: "balance is required (whole VND, 0 to 10^12)" }, 422);
    }
    const created: Jar = { ...jar, id: uniqueJarId(store.jars, jar.id) };
    const opening: JarLedgerEntry = {
      id: `led-${Date.now()}-open`,
      jarId: created.id,
      kind: "deposit",
      amount: body.balance as number,
      isOpening: true,
      createdAt: transferNow().toISOString(),
      source: "self_reported",
    };
    // Red Team #3: the cap sees the opening deposit that is not written yet.
    const next: JarConfig = {
      version: 3,
      jars: [...stripCategories(store.jars, created.categoryIds), created],
      ledger: [...(store.ledger ?? []), opening],
    };
    return ports.overCap(next, cif) ?? jsonResponse(ports.commit(next, cif), 201);
  }
  if (method === "PUT") {
    // D3: no deposits — a new id reads balance `null`; surviving ids keep their
    // anchor + ledger, and rows of removed ids go with them (in `commit`).
    const anchors = new Map(store.jars.map((j) => [j.id, j.createdAt]));
    const nextJars = ((body?.jars as Jar[]) ?? []).map((j) =>
      anchors.get(j.id) ? { ...j, createdAt: anchors.get(j.id) } : j,
    );
    const next: JarConfig = { version: 3, jars: nextJars, ledger: store.ledger ?? [] };
    return ports.overCap(next, cif) ?? jsonResponse(ports.commit(next, cif));
  }
  // No batch PATCH any more (Red Team #10): limits are per jar, money is the ledger.
  return jsonResponse({ error: "method not allowed" }, 405);
}

function handleOne(
  id: string,
  isCategories: boolean,
  method: string,
  body: Record<string, unknown> | undefined,
  cif: string | null,
  ports: JarsPorts,
): Response {
  const store = ports.readConfig();
  if (!store.jars.some((j) => j.id === id)) return jsonResponse({ error: `jar ${id} not found` }, 404);

  if (isCategories) {
    // POST /api/jars/:id/categories
    const categoryId = body?.categoryId as string;
    const stripped = stripCategories(store.jars, [categoryId]);
    const jars = stripped.map((j) => (j.id === id ? { ...j, categoryIds: [...j.categoryIds, categoryId] } : j));
    return jsonResponse(ports.commit({ version: 3, jars }, cif));
  }

  if (method === "PATCH") {
    const patch = (body?.patch ?? {}) as Record<string, unknown>;
    let jars = store.jars.map((j) => {
      if (j.id !== id) return j;
      const next: Record<string, unknown> = { ...j };
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete next[key];
        else next[key] = value;
      }
      return next as unknown as Jar;
    });
    if (patch.categoryIds) jars = stripCategories(jars, patch.categoryIds as string[], id);
    // A limit is a plan, not money: only a category move (it re-attributes spend
    // since each anchor) can change a balance, so only then is the cap checked.
    const capped = patch.categoryIds ? ports.overCap({ ...store, jars }, cif) : null;
    return capped ?? jsonResponse(ports.commit({ version: 3, jars }, cif));
  }
  if (method === "DELETE") {
    return jsonResponse(ports.commit({ version: 3, jars: store.jars.filter((j) => j.id !== id) }, cif));
  }
  return jsonResponse({ error: "unhandled" }, 500);
}

/** Route a `/api/jars*` request against the ports' in-memory store. */
export function handleJarsRequest(url: string, init: RequestInit | undefined, ports: JarsPorts): Response {
  const parsed = new URL(url, "http://localhost");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
  const cif = parsed.searchParams.get("cif") ?? (typeof body?.cif === "string" ? body.cif : null);
  const idMatch = parsed.pathname.match(/^\/api\/jars\/([^/]+)(\/categories)?$/);
  if (!idMatch) return handleCollection(method, body, cif, ports);
  return handleOne(idMatch[1], Boolean(idMatch[2]), method, body, cif, ports);
}
