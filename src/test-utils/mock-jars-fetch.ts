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

import { backfillActualAmount, dedupeCategories, healOrphanCategories, stripCategories, uniqueJarId } from "@/domain/jar-rules";
import type { Jar, JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";

let store: JarConfig = freshConfig();
let originalFetch: typeof globalThis.fetch | undefined;

function freshConfig(): JarConfig {
  return backfillActualAmount({
    version: 3,
    jars: DEFAULT_JAR_CONFIG.jars.map((j) => ({ ...j, categoryIds: [...j.categoryIds] })),
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
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
  const idMatch = parsed.pathname.match(/^\/api\/jars\/([^/]+)(\/categories)?$/);

  if (!idMatch) {
    if (method === "GET") return jsonResponse(store);
    if (method === "POST") {
      const jar = body?.jar as Jar;
      const created: Jar = { ...jar, id: uniqueJarId(store.jars, jar.id) };
      store = backfillActualAmount({
        version: 3,
        jars: [...stripCategories(store.jars, created.categoryIds), created],
      });
      return jsonResponse(store, 201);
    }
    if (method === "PUT") {
      const next = { version: 3 as const, jars: (body?.jars as Jar[]) ?? [] };
      store = backfillActualAmount(healOrphanCategories(dedupeCategories(next)));
      return jsonResponse(store);
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
    store = backfillActualAmount({
      version: 3,
      jars: stripped.map((j) => (j.id === id ? { ...j, categoryIds: [...j.categoryIds, categoryId] } : j)),
    });
    return jsonResponse(store);
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
    store = backfillActualAmount({ version: 3, jars });
    return jsonResponse(store);
  }
  if (method === "DELETE") {
    const remaining = { version: 3 as const, jars: store.jars.filter((j) => j.id !== id) };
    store = backfillActualAmount(target.categoryIds.length > 0 ? healOrphanCategories(remaining) : remaining);
    return jsonResponse(store);
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
    return originalFetch!(input as RequestInfo, init);
  }) as typeof fetch;
}

/** Reset the in-memory jar set back to the default template — call in `beforeEach`. */
export function resetMockJarsApi(): void {
  store = freshConfig();
}
