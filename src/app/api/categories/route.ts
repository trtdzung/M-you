import { NextResponse } from "next/server";
import { readCategories } from "@/lib/categories-store";

/**
 * The stored category taxonomy (see `data/schema.md`), in display order.
 * Read-only; the server validates every stored label against it.
 *
 *   GET → CategoryDef[]
 */
export async function GET() {
  try {
    return NextResponse.json(readCategories());
  } catch (err) {
    console.error("GET /api/categories failed", err);
    return NextResponse.json({ error: "categories unavailable" }, { status: 500 });
  }
}
