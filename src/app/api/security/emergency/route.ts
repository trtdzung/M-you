import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureCcBrief } from "@/lib/security/cc-brief";
import { startEmergency } from "@/lib/security/emergency";
import { readProfile } from "@/lib/security/profile-store";
import { respond } from "@/lib/security/orchestrator";

/** Hub/direct SOS entry and customer-confirmed account/card lock. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.cif !== "string" || !body.cif || body.cif.length > 64) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (body.action !== "enter" && body.action !== "lock" && body.action !== "brief") return NextResponse.json({ error: "action is invalid" }, { status: 422 });
  try {
    return NextResponse.json(getDb().transaction(() => {
      if (body.action === "brief") return { brief: ensureCcBrief(body.cif) };
      const profile = readProfile(body.cif);
      if (body.action === "lock" && profile.accountLocked && profile.cardsLocked) return { state: profile };
      const intervention = startEmergency(body.cif);
      const action = respond(body.cif, intervention.id, body.action === "lock" ? "Khóa ngay" : "Tôi nghĩ mình bị lừa");
      return { intervention, action, ...(body.action === "lock" ? { state: readProfile(body.cif) } : {}) };
    })());
  } catch {
    return NextResponse.json({ error: "engine unavailable" }, { status: 500 });
  }
}
