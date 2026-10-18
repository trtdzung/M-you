import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentAuthHeaders } from "@/lib/agent-proxy-auth";

/**
 * Same-origin proxy to the agent's `GET`/`DELETE /memory/preferences`
 * (`agent-docs/agent-to-backend/api.md`): what the agent itself remembered about the
 * customer from chat (GreenNode Long-Term Memory) — NOT the "Hướng dẫn cho M-You" form
 * (`/api/agent-preferences`), which the customer fills in. Keeps `AGENT_API_KEY`
 * server-side, like `../chat/route.ts`.
 */

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 422 });
  }

  const res = await fetch(`${AGENT_BASE_URL}/memory/preferences?user_id=${encodeURIComponent(userId)}`, {
    headers: await agentAuthHeaders(),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}

export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const recordId = req.nextUrl.searchParams.get("record_id");
  if (!userId || !recordId) {
    return NextResponse.json({ error: "user_id and record_id are required" }, { status: 422 });
  }

  const res = await fetch(
    `${AGENT_BASE_URL}/memory/preferences/${encodeURIComponent(recordId)}?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: await agentAuthHeaders() },
  );
  if (res.status === 404) {
    return NextResponse.json({ error: "Memory record not found" }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
