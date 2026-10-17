import { NextRequest, NextResponse } from "next/server";
import { dedupeCategories, healOrphanCategories, stripCategories, uniqueJarId } from "@/domain/jar-rules";
import type { Jar } from "@/domain/models";
import { assignableCategoryIds } from "@/lib/categories-store";
import { readJarConfig, sanitizeJar, sanitizeJarPatch, sanitizeJars, writeJarConfig } from "@/lib/jars-store";
import { capViolation, categoryViolation, reservedIdViolation } from "./jar-write-guards";

/**
 * Spending jars ("hũ") for one persona (`cif`), backed by `data/pfm.sqlite3`
 * (see `data/jars/schema.md`). Collection level — `cif` travels in the BODY here
 * (no `:id` in the path); the per-jar routes take it as a query param.
 *
 * This is where the jar invariants are enforced (`@/domain/jar-rules`): the
 * server is the single source of truth, so every write returns the resulting
 * `JarConfig` and the client just renders it (no client-side recompute, no
 * follow-up GET).
 *
 * Called by the browser only — `src/providers/mock/mock-provider.ts` is the
 * sole caller (architectural invariant #4).
 */

function missingCif() {
  return NextResponse.json({ error: "cif is required" }, { status: 422 });
}

/** GET /api/jars?cif= — the persona's jars, in display order. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return missingCif();
  return NextResponse.json(readJarConfig(cif));
}

/**
 * POST /api/jars — create one jar (body `{cif, jar}`). The id is made unique
 * against the existing set and the new jar's categories are taken away from
 * whichever jar held them (one-category-one-jar). 422 on a sentinel id (`pool`,
 * `unclassified`, `dieu-chinh-hu`, `khac`), a non-expense category, a
 * non-integer/negative `budgetLimit`, or a create that raises Σ past CASA.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return missingCif();
  const jar = sanitizeJar(body?.jar);
  if (!jar) return NextResponse.json({ error: "jar is invalid" }, { status: 422 });
  const rejected = reservedIdViolation([jar.id], true) ?? categoryViolation(cif, jar.categoryIds);
  if (rejected) return rejected;

  const current = readJarConfig(cif);
  const created = { ...jar, id: uniqueJarId(current.jars, jar.id) };
  const next: { version: 3; jars: Jar[] } = {
    version: 3,
    jars: [...stripCategories(current.jars, created.categoryIds), created],
  };
  const overCap = capViolation(cif, next.jars, current.jars);
  if (overCap) return overCap;
  return NextResponse.json(writeJarConfig(cif, next), { status: 201 });
}

/**
 * PUT /api/jars — REPLACE the persona's whole jar set (body `{cif, jars}`),
 * used by "áp mẫu" and "khôi phục mặc định". An arbitrary incoming set has not
 * been through the mutators, so it is deduped and healed (no category claimed
 * twice, none orphaned) before it is stored. 422 on `pool`/`unclassified`/
 * `dieu-chinh-hu` ids (`khac` round-trips — it is the system heal jar), a
 * non-expense category, or a replace that raises Σ budgetLimit past CASA.
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return missingCif();
  const jars = sanitizeJars(body?.jars);
  if (!jars) return NextResponse.json({ error: "jars is invalid" }, { status: 422 });
  if (new Set(jars.map((j) => j.id)).size !== jars.length) {
    return NextResponse.json({ error: "duplicate jar id" }, { status: 422 });
  }
  const rejected =
    reservedIdViolation(jars.map((j) => j.id), false) ?? categoryViolation(cif, jars.flatMap((j) => j.categoryIds));
  if (rejected) return rejected;

  // Heal against THIS persona's assignable taxonomy: a preset-only template must
  // not leave the user's own categories orphaned, and an archived one already in
  // a jar must stay there (the heal only ever adds).
  const next = healOrphanCategories(
    dedupeCategories({ version: 3, jars }),
    assignableCategoryIds(cif),
  );
  const overCap = capViolation(cif, next.jars, readJarConfig(cif).jars);
  if (overCap) return overCap;
  return NextResponse.json(writeJarConfig(cif, next));
}

/**
 * PATCH /api/jars?cif= — apply several jar patches ATOMICALLY (body `{cif,
 * patches: {jarId: patch}}`), used by "Chia ngay" to set every jar's
 * `budgetLimit` in one transaction. Server enforces the cap: if the batch RAISES
 * Σ budgetLimit past CASA it rejects 422 (client check is only UX); a no-op or
 * lowering batch always passes, even on an already-over-cap config.
 * `categoryIds` are NOT honoured here — category moves go through the per-jar
 * route so the one-category-one-jar invariant stays in one place.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = req.nextUrl.searchParams.get("cif") ?? (typeof body?.cif === "string" ? body.cif : null);
  if (!cif) return missingCif();

  const rawPatches = body?.patches;
  if (typeof rawPatches !== "object" || rawPatches === null || Array.isArray(rawPatches)) {
    return NextResponse.json({ error: "patches is invalid" }, { status: 422 });
  }

  const current = readJarConfig(cif);
  const byId = new Map(current.jars.map((j) => [j.id, j]));
  const merged = new Map<string, Jar>();

  for (const [jarId, rawPatch] of Object.entries(rawPatches as Record<string, unknown>)) {
    const prev = byId.get(jarId);
    if (!prev) return NextResponse.json({ error: `jar ${jarId} not found` }, { status: 404 });
    const patch = sanitizeJarPatch(rawPatch);
    if (!patch) return NextResponse.json({ error: `patch for ${jarId} is invalid` }, { status: 422 });
    delete patch.categoryIds; // category moves are not a batch concern
    merged.set(jarId, { ...prev, ...patch });
  }

  const nextJars = current.jars.map((j) => merged.get(j.id) ?? j);
  const overCap = capViolation(cif, nextJars, current.jars);
  if (overCap) return overCap;

  return NextResponse.json(writeJarConfig(cif, { version: 3, jars: nextJars }));
}
