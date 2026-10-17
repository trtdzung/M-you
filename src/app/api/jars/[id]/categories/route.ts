import { NextRequest, NextResponse } from "next/server";
import { stripCategories } from "@/domain/jar-rules";
import { readJarConfig, writeJarConfig } from "@/lib/jars-store";
import { categoryViolation } from "../../jar-write-guards";

/**
 * POST /api/jars/:id/categories?cif= — move `{categoryId}` into this jar.
 *
 * Deliberately NOT folded into PATCH: the semantics differ. PATCH overwrites one
 * jar's `categoryIds`, whereas this pulls the category out of EVERY jar (the
 * target included, so it can never end up listed twice) and then appends it to
 * the target. Under exactly-one there is no "unassign" — a category always
 * belongs to some jar — so this endpoint only ever moves, never removes.
 * `categoryId` must be an expense category of the taxonomy (422 otherwise).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const categoryId = body?.categoryId;
  if (!categoryId || typeof categoryId !== "string") {
    return NextResponse.json({ error: "categoryId is required" }, { status: 422 });
  }
  const badCategory = categoryViolation(cif, [categoryId]);
  if (badCategory) return badCategory;

  const current = readJarConfig(cif);
  if (!current.jars.some((j) => j.id === id)) {
    return NextResponse.json({ error: `jar ${id} not found` }, { status: 404 });
  }

  const stripped = stripCategories(current.jars, [categoryId]);
  const jars = stripped.map((j) =>
    j.id === id ? { ...j, categoryIds: [...j.categoryIds, categoryId] } : j,
  );
  return NextResponse.json(writeJarConfig(cif, { version: 3, jars }));
}
