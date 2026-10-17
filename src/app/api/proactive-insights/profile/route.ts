import { NextRequest, NextResponse } from "next/server";
import { syncFinancialProfile } from "@/lib/proactive-profile-store";

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof value.cif !== "string") return NextResponse.json({ error: "cif required" }, { status: 422 });
  try {
    const syncToken = syncFinancialProfile(value.cif, value.liabilities, value.goals);
    if (!syncToken) return NextResponse.json({ error: "invalid profile" }, { status: 422 });
    return NextResponse.json({ syncToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("POST /api/proactive-insights/profile failed", error);
    return NextResponse.json({ error: "profile unavailable" }, { status: 500 });
  }
}
