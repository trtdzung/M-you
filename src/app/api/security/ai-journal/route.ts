import { NextRequest, NextResponse } from "next/server";
import { listAiJournal } from "@/lib/security/ai-journal";

/** GET /api/security/ai-journal?cif= — what the Fraud agent did for this persona, newest first. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif || cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try {
    return NextResponse.json({ entries: listAiJournal(cif) });
  } catch (err) {
    console.error("GET /api/security/ai-journal failed", err);
    return NextResponse.json({ error: "journal unavailable" }, { status: 500 });
  }
}
