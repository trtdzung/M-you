import { NextRequest, NextResponse } from "next/server";
import { healOrphanCategories, stripCategories } from "@/domain/jar-rules";
import { fitsCasaCap } from "@/domain/engine";
import { readJarConfig, sanitizeJarPatch, writeJarConfig } from "@/lib/jars-store";
import { casaPoolForCif } from "@/lib/casa-pool";

/**
 * One jar of one persona. `cif` travels in the QUERY STRING on every `:id`
 * route (consistent per path, not per method — see `data/jars/schema.md`); the id is
 * the path segment. Both handlers return the persona's full, freshly-stored
 * `JarConfig` so the client never has to recompute or re-fetch.
 */

/**
 * PATCH /api/jars/:id?cif= — merge `{patch}` into one jar. Replacing
 * `categoryIds` takes those categories away from every other jar
 * (one-category-one-jar); `null` in the patch clears a field back to "chưa đặt".
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const patch = sanitizeJarPatch(body?.patch);
  if (!patch) return NextResponse.json({ error: "patch is invalid" }, { status: 422 });

  const current = readJarConfig(cif);
  const prev = current.jars.find((j) => j.id === id);
  if (!prev) {
    return NextResponse.json({ error: `jar ${id} not found` }, { status: 404 });
  }

  let jars = current.jars.map((j) => (j.id === id ? { ...prev, ...patch } : j));
  if (patch.categoryIds) jars = stripCategories(jars, patch.categoryIds, id);

  // Cap only when this patch SETS a numeric budgetLimit (the only way to raise Σ);
  // clearing a limit or editing label/color/category can never exceed CASA, and
  // must stay editable even if a legacy config is already over.
  if (typeof patch.budgetLimit === "number") {
    const cap = fitsCasaCap(jars, casaPoolForCif(cif) ?? "unknown", {});
    if (!cap.ok) {
      return NextResponse.json({ error: "over CASA cap", overBy: cap.overBy ?? null }, { status: 422 });
    }
  }
  return NextResponse.json(writeJarConfig(cif, { version: 3, jars }));
}

/**
 * DELETE /api/jars/:id?cif= — remove one jar. Its categories are force-moved to
 * "Khác" first, so no expense category is ever orphaned (invariant #6).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const { id } = await ctx.params;

  const current = readJarConfig(cif);
  const target = current.jars.find((j) => j.id === id);
  if (!target) return NextResponse.json({ error: `jar ${id} not found` }, { status: 404 });

  const remaining = { version: 3 as const, jars: current.jars.filter((j) => j.id !== id) };
  const next = target.categoryIds.length > 0 ? healOrphanCategories(remaining) : remaining;
  // The jar's categories heal into "Khác" above; there is no allocation ledger to
  // repoint any more (single-number model — budgetLimit lives on the jar itself).
  return NextResponse.json(writeJarConfig(cif, next));
}
