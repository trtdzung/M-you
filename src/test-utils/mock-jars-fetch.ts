/**
 * `/api/jars*` moved from browser localStorage to a real fetch call
 * (`src/state/jars.tsx`), which cannot resolve a relative URL in the
 * Vitest/jsdom test environment (there's no server behind it). Tests that
 * render the real provider stack (`JarConfigProvider` over the real
 * `mock-provider.ts`) — by design, to exercise real component + state logic —
 * need a stand-in for that one network boundary. This stubs `fetch` for
 * `/api/jars*` against an in-memory `JarConfig`, mirroring each real route
 * handler's own sequence of `@/domain/jar-rules` calls (including the
 * 404-on-unknown-id guards) so business logic isn't duplicated and behavior
 * stays load-bearing-correct for any future test, not just today's — only
 * the HTTP/DB transport is faked.
 */

import { dedupeCategories, healOrphanCategories, stripCategories, uniqueJarId } from "@/domain/jar-rules";
import { fitsCasaCap } from "@/domain/engine";
import type { Amount } from "@/domain/engine/types";
import type { Account, Jar, JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { buildPersonaAccounts } from "@/providers/mock/fixtures/generate";

/**
 * In-memory accounts per persona, mirroring the server's `accounts-store.ts`
 * (which is `server-only`). Seeded from the same canonical builder as the
 * fixtures/DB; a debit lowers `balance` + `availableBalance` so tests exercise
 * the real "money leaves the account" behavior over the fetch boundary.
 */
let accountsStore: Record<string, Account[]> = {};

function accountsFor(cif: string): Account[] {
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return [];
  if (!accountsStore[cif]) accountsStore[cif] = buildPersonaAccounts(persona);
  return accountsStore[cif];
}

/**
 * CASA pool for `cif`, mirroring the server's `casa-pool.ts` (server-only, can't
 * be imported here): live Σ `availableBalance` of the `current` accounts.
 */
function casaFor(cif: string | null): Amount {
  if (!cif) return "unknown";
  const current = accountsFor(cif).filter((a) => a.type === "current");
  if (current.length === 0) return "unknown";
  return current.reduce((s, a) => s + a.availableBalance, 0);
}

let store: JarConfig = freshConfig();
let originalFetch: typeof globalThis.fetch | undefined;

function freshConfig(): JarConfig {
  return {
    version: 3,
    jars: DEFAULT_JAR_CONFIG.jars.map((j) => ({ ...j, categoryIds: [...j.categoryIds] })),
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * The real `readJarConfig` normalizes (dedupe → heal → backfill)
 * UNCONDITIONALLY on every read, and every write handler's response comes
 * from calling it again afterward — so a write that only partially
 * normalizes (e.g. PATCH shrinking `categoryIds` without healing the
 * dropped category) still comes back healed. Routing every store update
 * AND every GET through this same commit point reproduces that guarantee
 * here, instead of each branch below needing to remember to normalize.
 */
function commit(next: JarConfig): JarConfig {
  store = healOrphanCategories(dedupeCategories(next));
  return store;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function handleJarsRequest(url: string, init?: RequestInit): Promise<Response> {
  const parsed = new URL(url, "http://localhost");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
  const cif = parsed.searchParams.get("cif") ?? (typeof body?.cif === "string" ? body.cif : null);
  const idMatch = parsed.pathname.match(/^\/api\/jars\/([^/]+)(\/categories)?$/);

  if (!idMatch) {
    if (method === "GET") return jsonResponse(commit(store));
    if (method === "POST") {
      const jar = body?.jar as Jar;
      const created: Jar = { ...jar, id: uniqueJarId(store.jars, jar.id) };
      return jsonResponse(
        commit({ version: 3, jars: [...stripCategories(store.jars, created.categoryIds), created] }),
        201,
      );
    }
    if (method === "PUT") {
      return jsonResponse(commit({ version: 3, jars: (body?.jars as Jar[]) ?? [] }));
    }
    if (method === "PATCH") {
      // Batch "Chia ngay": apply each patch (undefined-clears via null), enforce
      // Σ budgetLimit ≤ CASA (422), one write.
      const patches = (body?.patches ?? {}) as Record<string, Record<string, unknown>>;
      const byId = new Map(store.jars.map((j) => [j.id, j]));
      const merged = new Map<string, Jar>();
      for (const [jarId, patch] of Object.entries(patches)) {
        const prev = byId.get(jarId);
        if (!prev) return jsonResponse({ error: `jar ${jarId} not found` }, 404);
        const next: Record<string, unknown> = { ...prev };
        for (const [key, value] of Object.entries(patch)) {
          if (key === "categoryIds") continue;
          if (value === null) delete next[key];
          else next[key] = value;
        }
        merged.set(jarId, next as unknown as Jar);
      }
      const nextJars = store.jars.map((j) => merged.get(j.id) ?? j);
      const cap = fitsCasaCap(nextJars, casaFor(cif), {});
      if (!cap.ok) return jsonResponse({ error: "over CASA cap", overBy: cap.overBy ?? null }, 422);
      return jsonResponse(commit({ version: 3, jars: nextJars }));
    }
    return jsonResponse({ error: "unhandled" }, 500);
  }

  const id = idMatch[1];
  const target = store.jars.find((j) => j.id === id);
  if (!target) return jsonResponse({ error: `jar ${id} not found` }, 404);

  if (idMatch[2]) {
    // POST /api/jars/:id/categories
    const categoryId = body?.categoryId as string;
    const stripped = stripCategories(store.jars, [categoryId]);
    return jsonResponse(
      commit({
        version: 3,
        jars: stripped.map((j) => (j.id === id ? { ...j, categoryIds: [...j.categoryIds, categoryId] } : j)),
      }),
    );
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
    if (typeof patch.budgetLimit === "number") {
      const cap = fitsCasaCap(jars, casaFor(cif), {});
      if (!cap.ok) return jsonResponse({ error: "over CASA cap", overBy: cap.overBy ?? null }, 422);
    }
    return jsonResponse(commit({ version: 3, jars }));
  }
  if (method === "DELETE") {
    return jsonResponse(commit({ version: 3, jars: store.jars.filter((j) => j.id !== id) }));
  }
  return jsonResponse({ error: "unhandled" }, 500);
}

/**
 * `/api/accounts` + `/api/accounts/debit`, mirroring the real route handlers
 * over the fetch boundary: GET lists the persona's accounts, POST /debit lowers
 * `balance` + `availableBalance` (floored at 0) on the target row. This is the
 * test-side stand-in for the `server-only` `accounts-store.ts` DB.
 */
async function handleAccountsRequest(url: string, init?: RequestInit): Promise<Response> {
  const parsed = new URL(url, "http://localhost");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;

  if (parsed.pathname === "/api/accounts/debit") {
    if (method !== "POST") return jsonResponse({ error: "unhandled" }, 500);
    const cif = typeof body?.cif === "string" ? body.cif : null;
    const accountId = typeof body?.accountId === "string" ? body.accountId : null;
    const amount = typeof body?.amount === "number" ? body.amount : null;
    if (!cif || !accountId || amount === null || amount < 0) {
      return jsonResponse({ error: "cif, accountId and amount ≥ 0 required" }, 422);
    }
    const accounts = accountsFor(cif);
    const target = accounts.find((a) => a.id === accountId);
    if (!target) return jsonResponse({ error: `account ${accountId} not found` }, 404);
    target.balance = Math.max(0, target.balance - amount);
    target.availableBalance = Math.max(0, target.availableBalance - amount);
    return jsonResponse(target);
  }

  const cif = parsed.searchParams.get("cif");
  if (method === "GET") {
    if (!cif) return jsonResponse({ error: "cif required" }, 422);
    return jsonResponse(accountsFor(cif));
  }
  return jsonResponse({ error: "unhandled" }, 500);
}

/** Install the fetch stub — safe to call more than once (no-ops after the first). */
export function installMockJarsApi(): void {
  if (originalFetch) return; // already installed
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.startsWith("/api/jars")) return handleJarsRequest(url, init);
    if (url.startsWith("/api/accounts")) return handleAccountsRequest(url, init);
    return originalFetch!(input as RequestInfo, init);
  }) as typeof fetch;
}

/** Reset the in-memory jar set + accounts — call in `beforeEach`. */
export function resetMockJarsApi(): void {
  store = freshConfig();
  accountsStore = {};
}
