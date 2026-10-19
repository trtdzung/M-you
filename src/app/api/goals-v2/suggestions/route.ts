import { NextRequest, NextResponse } from "next/server";
import { getSuggestions } from "@/features/goals-preview/server/suggestions/service";

/** GET /api/goals-v2/suggestions?cif= → { suggestions, source, refreshing } — không bao giờ chờ agent. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return NextResponse.json(getSuggestions(cif));
  } catch (err) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("GET /api/goals-v2/suggestions failed", err);
    return NextResponse.json({ error: "suggestions unavailable" }, { status: 500 });
  }
}
