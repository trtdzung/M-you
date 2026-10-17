import { NextRequest, NextResponse } from "next/server";
import { isReservedJarId } from "@/domain/jar-rules";
import { normalizeCategoryLabel } from "@/domain/models/category-rules";
import { readCategories } from "@/lib/categories-store";
import { insertCategory } from "@/lib/categories-write";
import { categoryFailureResponse, missingCif, unprocessable } from "./category-write-guards";

/**
 * One persona's category taxonomy (see `data/schema.md`) — per-cif and writable
 * since the jar↔category rework. `cif` is REQUIRED on every method: the taxonomy
 * is user data, and a global read would leak one persona's custom categories
 * into another's pickers.
 *
 *   GET  ?cif=[&includeArchived=1] → CategoryDef[] (archived rows carry `archived: true`)
 *   POST { cif, label, fixed?, jarId? } → 201 { categories, jarConfig }
 */

/** GET /api/categories?cif=[&includeArchived=1] — the taxonomy in display order. */
export async function GET(req: NextRequest) {
  try {
    const cif = req.nextUrl.searchParams.get("cif");
    if (!cif) return missingCif();
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
    return NextResponse.json(readCategories(cif, { includeArchived }));
  } catch (err) {
    console.error("GET /api/categories failed", err);
    return NextResponse.json({ error: "categories unavailable" }, { status: 500 });
  }
}

/**
 * POST /api/categories — create ONE user category.
 *
 * `kind` is forced to `expense`: the `transfer` category is a system concept the
 * engine uses to EXCLUDE a txn from spend, so a body asking for it is rejected
 * rather than silently downgraded. The `id` is generated server-side from the
 * label (slug whitelist) — a client-supplied `id` is ignored outright.
 *
 * Optional `jarId` lands the category in THAT jar atomically ("Thêm danh mục"
 * from inside a jar); without it the jar read-heal puts it in "Khác". The
 * response carries the whole resulting aggregate so the client never re-fetches
 * into a race.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const cif = typeof body?.cif === "string" ? body.cif : null;
    if (!cif) return missingCif();

    if (body?.kind !== undefined && body.kind !== "expense") {
      return unprocessable("kind must be expense");
    }
    const label = normalizeCategoryLabel(body?.label);
    if (!label) return unprocessable("label must be 1–40 characters");
    if (body?.fixed !== undefined && typeof body.fixed !== "boolean") {
      return unprocessable("fixed must be a boolean");
    }
    const jarId = body?.jarId;
    if (jarId !== undefined && (typeof jarId !== "string" || jarId === "")) {
      return unprocessable("jarId must be a non-empty string");
    }
    if (typeof jarId === "string" && isReservedJarId(jarId, false)) {
      return unprocessable(`jar id ${jarId} is reserved`);
    }

    const result = insertCategory(cif, {
      label,
      fixed: body?.fixed === true,
      ...(typeof jarId === "string" ? { jarId } : {}),
    });
    if (!result.ok) return categoryFailureResponse(result.failure);
    return NextResponse.json({ categories: result.categories, jarConfig: result.jarConfig }, { status: 201 });
  } catch (err) {
    console.error("POST /api/categories failed", err);
    return NextResponse.json({ error: "category write failed" }, { status: 500 });
  }
}
