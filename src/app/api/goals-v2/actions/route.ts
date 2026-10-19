import { NextRequest, NextResponse } from "next/server";
import { applyAction } from "@/features/goals-preview/server/goal-service";
import type { PreviewAction } from "@/features/goals-preview/store/actions";

/**
 * POST /api/goals-v2/actions — body { cif, requestId, action }.
 * 200 { world, market } · 422 { error, world, market } khi thao tác bị từ chối (không ghi gì).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  const requestId = body?.requestId;
  const action: unknown = body?.action;
  if (typeof cif !== "string" || cif === "") return NextResponse.json({ error: "cif is required" }, { status: 422 });
  if (typeof requestId !== "string" || requestId === "") return NextResponse.json({ error: "requestId is required" }, { status: 422 });
  if (!action || typeof action !== "object" || typeof (action as { type?: unknown }).type !== "string") {
    return NextResponse.json({ error: "action is invalid" }, { status: 422 });
  }
  try {
    const result = applyAction(cif, requestId, action as PreviewAction);
    if (!result.ok) return NextResponse.json({ error: result.error, world: result.world, market: result.market }, { status: 422 });
    return NextResponse.json({ world: result.world, market: result.market });
  } catch (err) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("POST /api/goals-v2/actions failed", err);
    return NextResponse.json({ error: "action failed" }, { status: 500 });
  }
}
