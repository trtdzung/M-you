import { NextRequest, NextResponse } from "next/server";
import {
  backfillActualAmount,
  dedupeCategories,
  healOrphanCategories,
  stripCategories,
  uniqueJarId,
} from "@/domain/jar-rules";
import { readJarConfig, sanitizeJar, sanitizeJars, writeJarConfig } from "@/lib/jars-store";

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
 * whichever jar held them (one-category-one-jar).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return missingCif();
  const jar = sanitizeJar(body?.jar);
  if (!jar) return NextResponse.json({ error: "jar is invalid" }, { status: 422 });

  const current = readJarConfig(cif);
  const created = { ...jar, id: uniqueJarId(current.jars, jar.id) };
  const next = backfillActualAmount({
    version: 3,
    jars: [...stripCategories(current.jars, created.categoryIds), created],
  });
  return NextResponse.json(writeJarConfig(cif, next), { status: 201 });
}

/**
 * PUT /api/jars — REPLACE the persona's whole jar set (body `{cif, jars}`),
 * used by "áp mẫu" and "khôi phục mặc định". An arbitrary incoming set has not
 * been through the mutators, so it is deduped and healed (no category claimed
 * twice, none orphaned) before it is stored.
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

  const next = backfillActualAmount(healOrphanCategories(dedupeCategories({ version: 3, jars })));
  return NextResponse.json(writeJarConfig(cif, next));
}
