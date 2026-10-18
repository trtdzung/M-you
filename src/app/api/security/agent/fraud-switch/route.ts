import { NextRequest, NextResponse } from "next/server";
import { rejectAgent } from "@/lib/security/agent-gate";
import { readFraudAgentSwitch } from "@/lib/security/fraud-switch";

/** GET /api/security/agent/fraud-switch — the agent reads the kill switch before calling a model. */
export async function GET(req: NextRequest) {
  const denied = rejectAgent(req);
  if (denied) return denied;
  return NextResponse.json(readFraudAgentSwitch());
}
