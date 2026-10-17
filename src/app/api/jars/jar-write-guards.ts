import { NextResponse } from "next/server";
import { invalidExpenseCategoryIds, isReservedJarId } from "@/domain/jar-rules";
import { fitsCasaCap } from "@/domain/engine";
import type { Jar } from "@/domain/models";
import { casaPoolForCif } from "@/lib/casa-pool";
import { knownExpenseCategoryIds } from "@/lib/categories-store";

/**
 * Shared write-door checks for the `/api/jars` routes. Each returns the 422
 * response to send, or `null` when the write may proceed — so every door (POST,
 * PUT, PATCH, batch PATCH, category move) rejects bad input the same way instead
 * of silently ignoring it.
 */

function unprocessable(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status: 422 });
}

/**
 * CASA cap (S4/S5): reject only when the write RAISES Σ budgetLimit past the
 * persona's live CASA pool. `baseline` is the stored config before the write, so
 * lowering / clearing / re-saving always passes, even over cap or with CASA < 0.
 * Unknown CASA blocks increases only (`overBy: null`).
 */
export function capViolation(cif: string, nextJars: Jar[], baseline: Jar[]): NextResponse | null {
  const cap = fitsCasaCap(nextJars, casaPoolForCif(cif) ?? "unknown", {}, baseline);
  return cap.ok ? null : unprocessable({ error: "over CASA cap", overBy: cap.overBy ?? null });
}

/** Sentinel ids (S9): `pool`/`unclassified`/`dieu-chinh-hu` always; `khac` when creating. */
export function reservedIdViolation(ids: string[], creating: boolean): NextResponse | null {
  const reserved = ids.find((id) => isReservedJarId(id, creating));
  return reserved === undefined ? null : unprocessable({ error: `jar id ${reserved} is reserved` });
}

/**
 * Every category id must be an expense category of THIS PERSONA's stored
 * taxonomy (A11/A49) — `knownExpenseCategoryIds`, not the bundled constant, so a
 * category the user created a moment ago is assignable immediately and persona
 * A's custom id can never validate for persona B. Archived ids are included: a
 * jar PATCH sends the jar's full `categoryIds`, so a jar that already holds an
 * archived category must still be saveable.
 */
export function categoryViolation(cif: string, catIds: readonly string[]): NextResponse | null {
  const invalid = invalidExpenseCategoryIds(catIds, knownExpenseCategoryIds(cif));
  return invalid.length === 0
    ? null
    : unprocessable({ error: "categoryIds must be expense categories", invalid });
}
