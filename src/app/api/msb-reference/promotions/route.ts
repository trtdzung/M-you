import { NextRequest, NextResponse } from "next/server";
import { DEMO_NOW } from "@/lib/demo-clock";
import { listPromotions, PROMOTION_STATUSES, REFERENCE_AS_OF, type PromotionStatus } from "@/lib/msb-reference";

/** GET /api/msb-reference/promotions[?q=keyword][&status=active|upcoming|expired] — MSB promotions, status computed at the demo date. */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  if (status && !PROMOTION_STATUSES.includes(status as PromotionStatus)) {
    return NextResponse.json({ error: "status must be active, upcoming or expired" }, { status: 422 });
  }
  const items = listPromotions({ q: req.nextUrl.searchParams.get("q") ?? undefined, status: (status as PromotionStatus) ?? undefined }, DEMO_NOW);
  return NextResponse.json({ source: "mock", asOf: REFERENCE_AS_OF, items });
}
