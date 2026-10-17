import { NextRequest, NextResponse } from "next/server";
import { normalizeCategoryLabel } from "@/domain/models/category-rules";
import { deleteCategory, patchCategory } from "@/lib/categories-write";
import { categoryFailureResponse, missingCif, unprocessable } from "../category-write-guards";

/**
 * One category of one persona. `cif` travels in the QUERY STRING on every `:id`
 * route (consistent per path, not per method — same convention as
 * `/api/jars/:id`); the id is the path segment. Both handlers return the whole
 * resulting aggregate `{ categories, jarConfig }`, because a category write also
 * rewrites the jar set and the client must never have to reconcile the two.
 *
 * Only USER-CREATED categories are writable: a bundled preset answers 403.
 */

/**
 * The patchable fields, picked one by one off the body. `id` is deliberately NOT
 * among them — it is the path segment and it is immutable: a `patch.id` is
 * ignored, never applied (renaming an id would silently detach every stored
 * transaction that points at the old one).
 *
 * `null` is not a "clear" here (unlike a jar's `budgetLimit`): none of these
 * three fields has an "unset" state, so a non-boolean / non-string value REJECTS
 * the patch rather than being swallowed — a dropped field would leave the client
 * believing the write applied.
 */
function sanitizeCategoryPatch(
  input: unknown,
): { label?: string; fixed?: boolean; archived?: boolean } | { error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { error: "patch is invalid" };
  }
  const p = input as Record<string, unknown>;
  const patch: { label?: string; fixed?: boolean; archived?: boolean } = {};

  if ("label" in p) {
    const label = normalizeCategoryLabel(p.label);
    if (!label) return { error: "label must be 1–40 characters" };
    patch.label = label;
  }
  for (const key of ["fixed", "archived"] as const) {
    if (!(key in p)) continue;
    if (typeof p[key] !== "boolean") return { error: `${key} must be a boolean` };
    patch[key] = p[key] as boolean;
  }
  return patch;
}

/**
 * PATCH /api/categories/:id?cif= — rename, re-flag `fixed`, or archive/un-archive.
 *
 * Archiving is the escape hatch for a category that is still in use: it leaves
 * the pickers but KEEPS its jar membership and stays "known", so every past
 * month's jar totals are untouched and old corrections still round-trip.
 * Un-archiving re-runs the duplicate-label check — the label may have been taken
 * while it was hidden.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const cif = req.nextUrl.searchParams.get("cif");
    if (!cif) return missingCif();
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const patch = sanitizeCategoryPatch(body?.patch);
    if ("error" in patch) return unprocessable(patch.error);

    const result = patchCategory(cif, id, patch);
    if (!result.ok) return categoryFailureResponse(result.failure);
    return NextResponse.json({ categories: result.categories, jarConfig: result.jarConfig });
  } catch (err) {
    console.error("PATCH /api/categories/:id failed", err);
    return NextResponse.json({ error: "category write failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/categories/:id?cif= — hard-delete an UNUSED custom category and
 * strip it from its jar in the same transaction. 409 `{ error, usedBy }` when
 * any `transactions` / `transaction_corrections` row still points at it: the
 * alternative (reassigning that history to "Chưa phân loại") would move real
 * spend out of a real jar with no notice (invariants #5, #6).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const cif = req.nextUrl.searchParams.get("cif");
    if (!cif) return missingCif();
    const { id } = await ctx.params;

    const result = deleteCategory(cif, id);
    if (!result.ok) return categoryFailureResponse(result.failure);
    return NextResponse.json({ categories: result.categories, jarConfig: result.jarConfig });
  } catch (err) {
    console.error("DELETE /api/categories/:id failed", err);
    return NextResponse.json({ error: "category write failed" }, { status: 500 });
  }
}
