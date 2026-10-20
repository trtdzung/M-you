import { NextRequest, NextResponse } from "next/server";
import { getWorld } from "@/features/goals-preview/server/goal-service";

/**
 * GET /api/goals-v2?cif= → { world, market } — không bao giờ chờ đồng bộ giá.
 * GET /api/goals-v2?cif=&scope=names → { goals: [{ id, name, status }], assets: [{ id, goalId, name }] }: bản nhẹ (vài trăm byte) để
 * thẻ trong chat hiện tên mục tiêu / tài sản mà agent nhắc tới, không phải tải cả world kèm chuỗi giá (~1 MB).
 */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    const result = getWorld(cif);
    if (req.nextUrl.searchParams.get("scope") === "names") {
      const { goals, assets } = result.world;
      return NextResponse.json({
        goals: goals.map((g) => ({ id: g.id, name: g.name, status: g.status })),
        assets: assets.filter((a) => a.status !== "sold").map((a) => ({ id: a.id, goalId: a.goalId, name: a.name })),
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("GET /api/goals-v2 failed", err);
    return NextResponse.json({ error: "goals unavailable" }, { status: 500 });
  }
}
