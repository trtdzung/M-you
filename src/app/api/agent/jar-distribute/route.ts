import { NextRequest, NextResponse } from "next/server";
import { forwardToAgent, idList } from "@/lib/agent-proxy-auth";

/**
 * Same-origin proxy to the agent's `POST /jar-distribute` — "how should this
 * unallocated amount be split across my jars?" for a screen that already knows the
 * amount and has no conversation (`agent_backend_docs/jars/endpoints.md`). The "Chia
 * ngay" sheet is the caller.
 *
 * Only `{user_id, amount, jar_ids?}` are forwarded, each type-checked here, so the
 * browser cannot smuggle other fields (the agent answers `422` to unknown ones).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = body?.user_id;
  const amount = body?.amount;
  const jarIds = body?.jar_ids === undefined ? undefined : idList(body.jar_ids);
  if (
    typeof userId !== "string" || !userId ||
    typeof amount !== "number" || !Number.isFinite(amount) || Math.round(amount) <= 0 ||
    (body?.jar_ids !== undefined && !jarIds)
  ) {
    return NextResponse.json({ error: "user_id, amount (> 0) and, if present, a non-empty jar_ids list are required" }, { status: 422 });
  }
  return forwardToAgent("/jar-distribute", { user_id: userId, amount: Math.round(amount), ...(jarIds ? { jar_ids: jarIds } : {}) });
}
