import { NextResponse } from "next/server";
import { invalidExpenseCategoryIds, isReservedJarId } from "@/domain/jar-rules";
import { fitsCasaCap } from "@/domain/engine";
import type { Jar } from "@/domain/models";
import { casaPoolForCif } from "@/lib/casa-pool";

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

/** Every category id must be an expense category of the taxonomy (A11/A49). */
export function categoryViolation(catIds: readonly string[]): NextResponse | null {
  const invalid = invalidExpenseCategoryIds(catIds);
  return invalid.length === 0
    ? null
    : unprocessable({ error: "categoryIds must be expense categories", invalid });
}
