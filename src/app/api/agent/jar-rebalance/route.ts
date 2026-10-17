import { NextRequest, NextResponse } from "next/server";
import { forwardToAgent, idList } from "@/lib/agent-proxy-auth";

/**
 * Same-origin proxy to the agent's `POST /jar-rebalance` — "how should this jar's
 * balance move to other jars?" for a screen that knows the source jar and the amount
 * and has no conversation (`agent_backend_docs/jars/endpoints.md`). The transfer
 * screen uses it to explain the top-up of a jar that is short for the amount being sent.
 *
 * Only `{user_id, from_jar_id, amount, to_jar_ids?}` are forwarded, each type-checked
 * here, so the browser cannot smuggle other fields (the agent answers `422` to
 * unknown ones — the old `mode`/`target_jar_id`/`spend_amount` included).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = body?.user_id;
  const fromJarId = body?.from_jar_id;
  const amount = body?.amount;
  const toJarIds = body?.to_jar_ids === undefined ? undefined : idList(body.to_jar_ids);
  if (
    typeof userId !== "string" || !userId ||
    typeof fromJarId !== "string" || !fromJarId ||
    typeof amount !== "number" || !Number.isFinite(amount) || Math.round(amount) <= 0 ||
    (body?.to_jar_ids !== undefined && (!toJarIds || toJarIds.includes(fromJarId)))
  ) {
    return NextResponse.json(
      { error: "user_id, from_jar_id, amount (> 0) and, if present, a to_jar_ids list without from_jar_id are required" },
      { status: 422 },
    );
  }
  return forwardToAgent("/jar-rebalance", {
    user_id: userId,
    from_jar_id: fromJarId,
    amount: Math.round(amount),
    ...(toJarIds ? { to_jar_ids: toJarIds } : {}),
  });
}
