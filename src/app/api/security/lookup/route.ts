import { NextRequest, NextResponse } from "next/server";
import { LOOKUP_LABELS, lookupAccount } from "@/lib/security/warned-store";

/**
 * GET /api/security/lookup?account=&bank= — checks an account against the fraud
 * warning list (UC 10 "Tra cứu TK lừa đảo"). Three results: "Nguy hiểm" /
 * "Nghi ngờ" / "Chưa thấy dấu hiệu" — never "an toàn". The list is mock data.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const account = params.get("account")?.trim() ?? "";
  const bank = params.get("bank")?.trim() || undefined;
  if (!/^[\d\s.-]{6,34}$/.test(account)) return NextResponse.json({ error: "account is invalid" }, { status: 422 });
  if (bank && bank.length > 80) return NextResponse.json({ error: "bank is invalid" }, { status: 422 });
  try {
    const result = lookupAccount(account, bank);
    return NextResponse.json({ ...result, label: LOOKUP_LABELS[result.level], disclaimer: "Dữ liệu giả lập (mock)" });
  } catch (err) {
    console.error("GET /api/security/lookup failed", err);
    return NextResponse.json({ error: "lookup unavailable" }, { status: 500 });
  }
}
