import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentAuthHeaders } from "@/lib/agent-proxy-auth";

/**
 * Same-origin proxy to the agent's `POST /jar-rebalance` — the endpoint for screens
 * that know what they need and have no conversation (no thread, no memory; see the
 * agent repo's `docs/jar-rebalance-endpoint.md`). The transfer screen uses `cover`
 * to ask how to fund a jar that is short for the amount being sent.
 *
 * Only the fields `cover` needs are forwarded, with their types checked here, so the
 * browser cannot pick another mode or smuggle other fields through the proxy.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = body?.user_id;
  const targetJarId = body?.target_jar_id;
  const spendAmount = body?.spend_amount;
  if (
    typeof userId !== "string" || !userId ||
    typeof targetJarId !== "string" || !targetJarId ||
    typeof spendAmount !== "number" || !Number.isFinite(spendAmount) || spendAmount <= 0
  ) {
    return NextResponse.json({ error: "user_id, target_jar_id and spend_amount (> 0) are required" }, { status: 422 });
  }

  const res = await fetch(`${AGENT_BASE_URL}/jar-rebalance`, {
    method: "POST",
    headers: await agentAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ user_id: userId, mode: "cover", target_jar_id: targetJarId, spend_amount: Math.round(spendAmount) }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
