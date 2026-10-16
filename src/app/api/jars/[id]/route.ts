import { NextRequest, NextResponse } from "next/server";
import { healOrphanCategories, stripCategories } from "@/domain/jar-rules";
import { getDb } from "@/lib/db";
import { readJarConfig, sanitizeJarPatch, writeJarConfig } from "@/lib/jars-store";
import { deleteRebalanceLegsForJar } from "@/lib/manual-txns-store";
import { capViolation, categoryViolation } from "../jar-write-guards";

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
  const badCategories = patch.categoryIds ? categoryViolation(patch.categoryIds) : null;
  if (badCategories) return badCategories;

  const current = readJarConfig(cif);
  const prev = current.jars.find((j) => j.id === id);
  if (!prev) {
    return NextResponse.json({ error: `jar ${id} not found` }, { status: 404 });
  }

  let jars = current.jars.map((j) => (j.id === id ? { ...prev, ...patch } : j));
  if (patch.categoryIds) jars = stripCategories(jars, patch.categoryIds, id);

  // Only a write that RAISES Σ budgetLimit past CASA is rejected: clearing,
  // lowering, re-saving or editing label/color/category always passes, even if a
  // legacy config (or a CASA drop after a transfer) left it over cap.
  const overCap = capViolation(cif, jars, current.jars);
  if (overCap) return overCap;
  return NextResponse.json(writeJarConfig(cif, { version: 3, jars }));
}

/**
 * DELETE /api/jars/:id?cif= — remove one jar. Its categories are force-moved to
 * "Khác" first, so no expense category is ever orphaned (invariant #6). Every
 * rebalance leg (`dieu-chinh-hu` manual txn) whose `rebalance.fromJarId` or
 * `toJarId` is this jar is deleted in the SAME DB transaction (S8) — a leg
 * pointing at a vanished jar would move money "from nowhere". Response: the
 * resulting `JarConfig` (unchanged contract); the number of legs removed is in
 * the `X-Rebalance-Legs-Deleted` header.
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
  const removeJarAndLegs = getDb().transaction(() => {
    const legsDeleted = deleteRebalanceLegsForJar(cif, id);
    return { config: writeJarConfig(cif, next), legsDeleted };
  });
  const { config, legsDeleted } = removeJarAndLegs();
  return NextResponse.json(config, { headers: { "X-Rebalance-Legs-Deleted": String(legsDeleted) } });
}
