import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentAuthHeaders } from "@/lib/agent-proxy-auth";

/**
 * Same-origin proxy to the real M-You agent backend (`server.py`, see
 * `agent_backend_docs/api.md`) — the browser calls this route
 * (`src/lib/agent-api.ts`), never the agent server directly, so
 * `AGENT_API_KEY`/Auth0 credentials never reach the client.
 */

const BASE_URL = AGENT_BASE_URL;
const authHeaders = agentAuthHeaders;

export async function POST(req: NextRequest) {
  const { message, user_id } = await req.json();
  if (!message || !user_id) {
    return NextResponse.json({ error: "message and user_id are required" }, { status: 422 });
  }

  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, user_id }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data);
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 422 });
  }

  const res = await fetch(`${BASE_URL}/chat/history?user_id=${encodeURIComponent(userId)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 422 });
  }

  const res = await fetch(`${BASE_URL}/chat/history?user_id=${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
