/**
 * Test-side stand-in for `/api/categories*` (the real handlers sit on the
 * `server-only` SQLite stores), mirroring `mock-jars-fetch.ts`: only the HTTP/DB
 * transport is faked. Every rule below is the route's own rule, run through the
 * same pure helpers (`@/domain/models/category-rules`, `@/domain/jar-rules`), so
 * the client state under test meets the real refusals — 403 on a preset, 409 on a
 * duplicate label, 409 + `usedBy` on a category still in use.
 *
 * The taxonomy is PER CIF, seeded lazily from the bundled `CATEGORIES` exactly as
 * `categories-store.ts` seeds a fresh persona. A write also rewrites the hũ set,
 * so the jar store is reached through an injected port rather than imported —
 * that keeps this module free of a cycle with `mock-jars-fetch.ts`, which owns it.
 */

import { stripCategories } from "@/domain/jar-rules";
import { CATEGORIES, type Jar, type JarConfig, type StoredCategory } from "@/domain/models";
import {
  isReservedCategoryId,
  labelConflict,
  normalizeCategoryLabel,
  slugCategoryId,
  uniqueCategoryId,
} from "@/domain/models/category-rules";

interface Row extends StoredCategory {
  custom: boolean;
}

export interface CategoryJarPort {
  /** The stored hũ set. */
  readJars(): JarConfig;
  /** Persist + normalise (dedupe → heal against `cif`'s assignable set). */
  commitJars(jars: Jar[], cif: string): JarConfig;
  /** Records still pointing at `id` — the DELETE gate. */
  usageCount(cif: string, id: string): number;
}

let store: Record<string, Row[]> = {};

function rowsFor(cif: string): Row[] {
  store[cif] ??= CATEGORIES.map((c) => ({ ...c, custom: false }));
  return store[cif];
}

/** Drop `custom` — a write-door concern, not part of the taxonomy contract. */
function toPublic({ custom: _custom, ...category }: Row): StoredCategory {
  return category;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/** The persona's taxonomy as `GET /api/categories` would return it. */
export function mockCategories(cif: string, includeArchived = false): StoredCategory[] {
  return rowsFor(cif)
    .filter((r) => includeArchived || !r.archived)
    .map(toPublic);
}

/** ACTIVE expense ids — what a hũ may take, and what the read-heal sweeps. */
export function mockAssignableCategoryIds(cif: string): Set<string> {
  return new Set(mockCategories(cif).filter((c) => c.kind === "expense").map((c) => c.id));
}

/** ACTIVE ∪ ARCHIVED, every kind — what a stored correction is validated against. */
export function mockKnownCategoryIds(cif: string): Set<string> {
  return new Set(mockCategories(cif, true).map((c) => c.id));
}

/** `{ categories, jarConfig }` — the aggregate every write answers with. */
function aggregate(cif: string, jarConfig: JarConfig, status = 200): Response {
  return jsonResponse({ categories: mockCategories(cif), jarConfig }, status);
}

function createCategory(cif: string, body: Record<string, unknown>, port: CategoryJarPort): Response {
  if (body.kind !== undefined && body.kind !== "expense") {
    return jsonResponse({ error: "kind must be expense" }, 422);
  }
  const label = normalizeCategoryLabel(body.label);
  if (!label) return jsonResponse({ error: "label must be 1–40 characters" }, 422);
  if (body.fixed !== undefined && typeof body.fixed !== "boolean") {
    return jsonResponse({ error: "fixed must be a boolean" }, 422);
  }
  const rows = rowsFor(cif);
  if (labelConflict(label, rows.map((r) => r.label))) {
    return jsonResponse({ error: "duplicate label" }, 409);
  }
  const jarId = typeof body.jarId === "string" ? body.jarId : undefined;
  if (jarId !== undefined && !port.readJars().jars.some((j) => j.id === jarId)) {
    return jsonResponse({ error: "jar not found" }, 404);
  }

  const id = uniqueCategoryId(slugCategoryId(label), rows.map((r) => r.id));
  if (isReservedCategoryId(id)) throw new Error(`generated reserved category id ${id}`);
  rows.push({ id, label, kind: "expense", fixed: body.fixed === true, custom: true });

  // No jarId: the heal inside `commitJars` sees a brand-new orphan expense
  // category and drops it into "Khác", exactly as the real read-heal does.
  const jars = jarId
    ? port.readJars().jars.map((j) => (j.id === jarId ? { ...j, categoryIds: [...j.categoryIds, id] } : j))
    : port.readJars().jars;
  return aggregate(cif, port.commitJars(jars, cif), 201);
}

function patchCategory(cif: string, id: string, body: Record<string, unknown>, port: CategoryJarPort): Response {
  const patch = (body.patch ?? {}) as Record<string, unknown>;
  const row = rowsFor(cif).find((r) => r.id === id);
  if (!row) return jsonResponse({ error: "category not found" }, 404);
  if (!row.custom) return jsonResponse({ error: "built-in category" }, 403);

  let label = row.label;
  if ("label" in patch) {
    const next = normalizeCategoryLabel(patch.label);
    if (!next) return jsonResponse({ error: "label must be 1–40 characters" }, 422);
    label = next;
  }
  for (const key of ["fixed", "archived"] as const) {
    if (key in patch && typeof patch[key] !== "boolean") {
      return jsonResponse({ error: `${key} must be a boolean` }, 422);
    }
  }
  // Un-archiving re-runs the duplicate check: the label may have been taken while
  // the category was hidden.
  if ("label" in patch || patch.archived === false) {
    const others = rowsFor(cif).filter((r) => r.id !== id).map((r) => r.label);
    if (labelConflict(label, others)) return jsonResponse({ error: "duplicate label" }, 409);
  }

  row.label = label;
  if (typeof patch.fixed === "boolean") row.fixed = patch.fixed;
  if (patch.archived === true) row.archived = true;
  else if (patch.archived === false) delete row.archived;
  return aggregate(cif, port.commitJars(port.readJars().jars, cif));
}

function deleteCategory(cif: string, id: string, port: CategoryJarPort): Response {
  const rows = rowsFor(cif);
  const row = rows.find((r) => r.id === id);
  if (!row) return jsonResponse({ error: "category not found" }, 404);
  if (!row.custom) return jsonResponse({ error: "built-in category" }, 403);
  const usedBy = port.usageCount(cif, id);
  if (usedBy > 0) return jsonResponse({ error: "category in use", usedBy }, 409);

  store[cif] = rows.filter((r) => r.id !== id);
  // Strip AFTER the delete: the id is no longer assignable, so the heal inside
  // `commitJars` cannot put it straight back.
  return aggregate(cif, port.commitJars(stripCategories(port.readJars().jars, [id]), cif));
}

/** Handle `/api/categories*`; `null` when the URL is something else. */
export function handleCategoriesRequest(
  url: string,
  init: RequestInit | undefined,
  port: CategoryJarPort,
): Response | null {
  const parsed = new URL(url, "http://localhost");
  if (!parsed.pathname.startsWith("/api/categories")) return null;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
  const cif = parsed.searchParams.get("cif") ?? (typeof body.cif === "string" ? body.cif : null);
  if (!cif) return jsonResponse({ error: "cif is required" }, 422);
  const idMatch = parsed.pathname.match(/^\/api\/categories\/([^/]+)$/);

  if (!idMatch) {
    if (method === "GET") {
      return jsonResponse(mockCategories(cif, parsed.searchParams.get("includeArchived") === "1"));
    }
    if (method === "POST") return createCategory(cif, body, port);
    return jsonResponse({ error: "unhandled" }, 500);
  }
  const id = decodeURIComponent(idMatch[1]);
  if (method === "PATCH") return patchCategory(cif, id, body, port);
  if (method === "DELETE") return deleteCategory(cif, id, port);
  return jsonResponse({ error: "unhandled" }, 500);
}

export function resetMockCategories(): void {
  store = {};
}
