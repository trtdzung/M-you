import { NextRequest, NextResponse } from "next/server";
import { AGENT_BASE_URL, agentAuthHeaders } from "@/lib/agent-proxy-auth";

/**
 * POST /api/goals-v2/price-estimate  { cif, template, description?, answers?, refresh? } → agent `POST /goal-price-estimates`.
 * Không có `answers`: agent trả form để khách tick (`questions`). Có `answers`: agent tra giá thị trường và đề xuất (`estimate`).
 * Lỗi của model hoặc tìm kiếm không phải lỗi HTTP: agent trả 200 với `estimate` rỗng và `reason`.
 */
export async function POST(req: NextRequest) {
  let body: { cif?: unknown; template?: unknown; description?: unknown; answers?: unknown; refresh?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 422 });
  }
  if (typeof body.cif !== "string" || !body.cif || typeof body.template !== "string" || !body.template) {
    return NextResponse.json({ error: "cif and template are required" }, { status: 422 });
  }
  const payload = JSON.stringify({
    user_id: body.cif,
    template: body.template,
    ...(typeof body.description === "string" && body.description.trim() ? { description: body.description.trim().slice(0, 200) } : {}),
    ...(body.answers && typeof body.answers === "object" ? { answers: body.answers } : {}),
    ...(body.refresh === true ? { refresh: true } : {}),
  });
  const call = async () =>
    fetch(`${AGENT_BASE_URL}/goal-price-estimates`, {
      method: "POST",
      headers: await agentAuthHeaders({ "Content-Type": "application/json" }),
      body: payload,
      signal: AbortSignal.timeout(130_000),
    });
  try {
    let res: Response;
    try {
      res = await call();
    } catch (err) {
      // Không kết nối được tới agent trong 10 giây (mạng chập chờn hoặc agent vừa khởi động): thử lại một lần. Việc này chỉ đọc, thử lại an toàn.
      if ((err as { cause?: { code?: string } }).cause?.code !== "UND_ERR_CONNECT_TIMEOUT") throw err;
      res = await call();
    }
    if (!res.ok) return NextResponse.json({ error: "price estimate unavailable" }, { status: res.status === 422 ? 422 : 502 });
    const reply = (await res.json()) as { estimate?: unknown; questions?: unknown; reason?: string };
    // Agent chạy xong nhưng không đề xuất được giá: ghi lý do ra log để biết vì sao (giao diện chỉ báo chung chung).
    if (!reply.estimate && !reply.questions) console.warn("price-estimate: no estimate", { template: body.template, answers: body.answers, reason: reply.reason });
    return NextResponse.json(reply);
  } catch (err) {
    console.error("POST /api/goals-v2/price-estimate failed", err);
    return NextResponse.json({ error: "price estimate unavailable" }, { status: 502 });
  }
}
