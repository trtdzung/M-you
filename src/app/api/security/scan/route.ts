import { NextRequest, NextResponse } from "next/server";
import { enrichMessageScan } from "@/lib/security/message-scan";

/** POST /api/security/scan {text, cif?} — rule result, replaced by the agent only when it does not lower the level. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) return NextResponse.json({ error: "text is invalid" }, { status: 422 });
  const cif = typeof body?.cif === "string" && body.cif.length > 0 && body.cif.length <= 64 ? body.cif : undefined;
  return NextResponse.json(await enrichMessageScan(text, cif));
}
