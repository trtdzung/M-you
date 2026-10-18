import { NextRequest, NextResponse } from "next/server";
import { enrichMessageScan } from "@/lib/security/message-scan";

/** POST /api/security/scan {text} — rule result, replaced by the agent only when it does not lower the level. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) return NextResponse.json({ error: "text is invalid" }, { status: 422 });
  return NextResponse.json(await enrichMessageScan(text));
}
