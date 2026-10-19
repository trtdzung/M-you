import { NextRequest, NextResponse } from "next/server";
import { getWorld } from "@/features/goals-preview/server/goal-service";

/** GET /api/goals-v2?cif= → { world, market } — không bao giờ chờ đồng bộ giá. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return NextResponse.json(getWorld(cif));
  } catch (err) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("GET /api/goals-v2 failed", err);
    return NextResponse.json({ error: "goals unavailable" }, { status: 500 });
  }
}
