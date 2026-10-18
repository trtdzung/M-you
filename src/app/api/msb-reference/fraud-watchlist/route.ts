import { NextRequest, NextResponse } from "next/server";
import { checkFraud, FRAUD_TYPES, listFraud, REFERENCE_AS_OF, type FraudType } from "@/lib/msb-reference";

/**
 * GET /api/msb-reference/fraud-watchlist[?type=phone|account|domain]  → the list
 * GET /api/msb-reference/fraud-watchlist?value=<phone|account|link>   → { found, entries, note }
 * Not found only means "not on the list": it never proves a number or link is safe.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const value = params.get("value");
  if (value) {
    return NextResponse.json({ source: "mock", asOf: REFERENCE_AS_OF, query: value, ...checkFraud(value),
      note: "Không có trong danh sách không đồng nghĩa với an toàn." });
  }
  const type = params.get("type");
  if (type && !FRAUD_TYPES.includes(type as FraudType)) {
    return NextResponse.json({ error: `type must be one of ${FRAUD_TYPES.join(", ")}` }, { status: 422 });
  }
  return NextResponse.json({ source: "mock", asOf: REFERENCE_AS_OF, items: listFraud((type as FraudType) ?? undefined) });
}
