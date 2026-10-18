import { NextRequest, NextResponse } from "next/server";
import { readFraudAgentSwitch, writeFraudAgentEnabled } from "@/lib/security/fraud-switch";

/** GET /api/security/fraud-agent → `{ enabled, forcedOff }`. */
export async function GET() {
  return NextResponse.json(readFraudAgentSwitch());
}

/** PUT /api/security/fraud-agent `{ enabled }` — test-tools kill switch. Env off wins. */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "enabled is required" }, { status: 422 });
  return NextResponse.json(writeFraudAgentEnabled(body.enabled));
}
