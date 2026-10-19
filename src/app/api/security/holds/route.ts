import { NextRequest, NextResponse } from "next/server";
import { requestHold } from "@/lib/security/holds";

/**
 * POST /api/security/holds — body `{ cif, review }` (the transfer the customer
 * just confirmed). → `{ hold }`: a running hold (UC 10 b), or null when the
 * transfer may go now. The rule decides; the agent never releases a hold.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const r = body?.review;
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (!r || typeof r.amount !== "number" || !(r.amount > 0) || typeof r.recipientName !== "string" || typeof r.recipientAccount !== "string" || !/\d{4}/.test(r.recipientAccount)) {
    return NextResponse.json({ error: "review is invalid" }, { status: 422 });
  }
  try {
    return NextResponse.json({
      hold: requestHold(body.cif, {
        amount: r.amount,
        recipientName: String(r.recipientName).slice(0, 120),
        recipientAccount: String(r.recipientAccount).slice(0, 40),
        recipientBank: typeof r.recipientBank === "string" ? r.recipientBank.slice(0, 80) : undefined,
        memo: typeof r.memo === "string" ? r.memo.slice(0, 200) : null,
        sourceAccountId: typeof r.sourceAccountId === "string" ? r.sourceAccountId : null,
      }),
    });
  } catch (err) {
    console.error("POST /api/security/holds failed", err);
    return NextResponse.json({ error: "hold unavailable" }, { status: 500 });
  }
}
