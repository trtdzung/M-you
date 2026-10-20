import { NextRequest, NextResponse } from "next/server";
import { peekGoalInsight, readGoalInsight } from "@/features/goals-preview/server/goal-insight";

/**
 * GET /api/goals-v2/insight?cif=&goalId= → { insight: { goalId, goalName, observation, suggestion } | null, refreshing }.
 * `&peek=1`: chỉ đọc bản đã lưu (không làm mới) — agent chat dùng để biết đúng thẻ khách đã thấy.
 * Luôn trả ngay bản đã lưu; `refreshing: true` nghĩa là agent đang viết bản mới ở nền, đọc lại sau vài giây.
 */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  const goalId = req.nextUrl.searchParams.get("goalId");
  if (!cif || !goalId) return NextResponse.json({ error: "cif and goalId are required" }, { status: 422 });
  try {
    if (req.nextUrl.searchParams.get("peek") === "1") return NextResponse.json({ insight: peekGoalInsight(cif, goalId), refreshing: false });
    return NextResponse.json(readGoalInsight(cif, goalId));
  } catch (err) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("GET /api/goals-v2/insight failed", err);
    return NextResponse.json({ error: "insight unavailable" }, { status: 500 });
  }
}
