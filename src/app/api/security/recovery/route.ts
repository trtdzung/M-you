import { NextRequest, NextResponse } from "next/server";
import { recoveryState } from "@/lib/security/recovery";

export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif || cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  try { return NextResponse.json(recoveryState(cif)); }
  catch { return NextResponse.json({ error: "recovery unavailable" }, { status: 500 }); }
}
