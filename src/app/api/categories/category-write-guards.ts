import { NextResponse } from "next/server";
import type { CategoryFailure } from "@/lib/categories-write";

/**
 * Shared responses for the `/api/categories` routes, mirroring
 * `../jars/jar-write-guards.ts`: every door refuses bad input the same way, and
 * the store's `CategoryFailure` codes map to HTTP in exactly ONE place — so a
 * new failure code can never quietly become a 500.
 */

export function missingCif(): NextResponse {
  return NextResponse.json({ error: "cif is required" }, { status: 422 });
}

export function unprocessable(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 422 });
}

/**
 * Store failure → HTTP:
 *  - `built-in` → **403**: a bundled preset is immutable through the API. Not a
 *    404 (it exists) and not a 422 (the request is well-formed) — it is a
 *    privilege answer.
 *  - `in-use` → **409** with the exact count, so the UI can say how many records
 *    still point at it and offer "Ẩn danh mục" (archive) instead. Deleting it
 *    would move real historical spend out of a real jar (invariants #5, #6).
 *  - `duplicate-label` → **409**: a conflict with an existing (possibly archived)
 *    row, not a malformed field.
 */
export function categoryFailureResponse(failure: CategoryFailure): NextResponse {
  switch (failure.code) {
    case "built-in":
      return NextResponse.json({ error: "built-in category" }, { status: 403 });
    case "not-found":
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    case "jar-not-found":
      return NextResponse.json({ error: "jar not found" }, { status: 404 });
    case "duplicate-label":
      return NextResponse.json({ error: "duplicate label" }, { status: 409 });
    case "in-use":
      return NextResponse.json({ error: "category in use", usedBy: failure.usedBy }, { status: 409 });
  }
}
