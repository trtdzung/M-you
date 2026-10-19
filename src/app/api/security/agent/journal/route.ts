import { NextRequest, NextResponse } from "next/server";
import { recordAiJournal } from "@/lib/security/ai-journal";
import { rejectAgent } from "@/lib/security/agent-gate";
import { fraudAgentEnabled } from "@/lib/security/fraud-switch";

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

/**
 * POST /api/security/agent/journal — chat-signal has no pfm caller, so the agent
 * writes that one row here. Tool names only; the message itself is not accepted.
 */
export async function POST(req: NextRequest) {
  const denied = rejectAgent(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!text(body?.cif, 64) || !body.cif) return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (body.action !== "chat-signal") return NextResponse.json({ error: "action is invalid" }, { status: 422 });
  if (body.ref !== undefined && body.ref !== null && !text(body.ref, 80)) return NextResponse.json({ error: "ref is invalid" }, { status: 422 });
  if (!text(body.data_used, 500) || !text(body.output, 240)) return NextResponse.json({ error: "journal is invalid" }, { status: 422 });
  if (!fraudAgentEnabled()) return NextResponse.json({ skipped: true });
  recordAiJournal(body.cif, "chat-signal", body.ref ?? null, body.data_used, body.output);
  return NextResponse.json({ ok: true });
}
