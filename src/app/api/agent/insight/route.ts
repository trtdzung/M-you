import { NextRequest, NextResponse } from "next/server";

/** Background insights have their own upstream endpoint and no chat history. */
const BASE_URL = process.env.AGENT_API_BASE_URL || "http://localhost:8080";
const INSIGHT_URL = process.env.AGENT_INSIGHT_API_URL || `${BASE_URL.replace(/\/$/, "")}/insight`;
const API_KEY = process.env.AGENT_API_KEY || "";
const TIMEOUT_MS = 6_000;

const JAR_BURN_TASK =
  "Giải thích ngắn gọn bằng tiếng Việt vì sao hũ chi tiêu linh hoạt có thể hết trước cuối tháng và đề xuất một hành động cụ thể. Chỉ dùng các metrics được cung cấp; không thêm con số, ngày tháng, tên sản phẩm hoặc giao dịch mới. Trả về snapshot_id, explanation, suggested_action. Không ghi vào lịch sử chat.";

const INVESTMENT_TASK =
  "Dựa vào bức tranh tài chính đầy đủ của người dùng (số dư nhàn rỗi, tỷ lệ tiết kiệm, runway, tài sản, nợ, mục tiêu tài chính và xu hướng chi tiêu), hãy phân tích và quyết định: (1) Người dùng có đủ điều kiện và nên được giới thiệu sản phẩm đầu tư MSB hay không? (2) Nếu có, chọn product_id phù hợp: \"m-sinh-loi\" (tiền nhàn rỗi ngắn hạn, rút linh hoạt) hoặc \"tiet-kiem\" (surplus lớn, muốn lãi cao hơn, chấp nhận kỳ hạn). Nếu không, trả product_id là null. Viết explanation và suggested_action ngắn gọn bằng tiếng Việt thuần túy, không chứa con số. Trả về JSON: {snapshot_id, product_id, explanation, suggested_action}. Không ghi vào lịch sử chat.";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
  };
  const domain = process.env.AUTH0_DOMAIN;
  if (!domain) return headers;
  if (!cachedToken || Date.now() >= tokenExpiresAt) {
    const res = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.AUTH0_CLIENT_ID || "",
        client_secret: process.env.AUTH0_CLIENT_SECRET || "",
        audience: process.env.AUTH0_AUDIENCE || "",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Auth0 token error ${res.status}`);
    const token: unknown = await res.json();
    if (
      !token || typeof token !== "object" ||
      typeof (token as { access_token?: unknown }).access_token !== "string"
    ) throw new Error("Invalid Auth0 response");
    cachedToken = (token as { access_token: string }).access_token;
    const expiresIn = Number((token as { expires_in?: unknown }).expires_in);
    tokenExpiresAt =
      Date.now() +
      Math.max(0, (Number.isFinite(expiresIn) ? expiresIn : 300) - 60) * 1000;
  }
  headers.Authorization = `Bearer ${cachedToken}`;
  return headers;
}

// ─── type helpers ─────────────────────────────────────────────────────────────

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shortString(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

// ─── request validation ───────────────────────────────────────────────────────

function validJarBurnRequest(value: unknown): value is Record<string, unknown> {
  if (!record(value) || !record(value.metrics)) return false;
  const m = value.metrics;
  const numbers = [
    "balance", "days_remaining", "daily_burn", "safe_daily_spend",
    "days_to_empty", "projected_shortfall", "active_days",
  ];
  return (
    shortString(value.user_id, 64) &&
    shortString(value.insight_id) &&
    shortString(value.snapshot_id) &&
    value.trigger_type === "jar_burn" &&
    shortString(value.as_of, 64) &&
    Number.isFinite(Date.parse(value.as_of)) &&
    shortString(m.jar_id, 128) &&
    shortString(m.jar_label, 128) &&
    shortString(m.period_end, 64) &&
    Number.isFinite(Date.parse(m.period_end)) &&
    m.source === "estimated" &&
    (m.severity === "attention" || m.severity === "urgent") &&
    numbers.every(
      (k) => typeof m[k] === "number" && Number.isFinite(m[k]) && (m[k] as number) >= 0,
    )
  );
}

function validInvestmentRequest(value: unknown): value is Record<string, unknown> {
  if (!record(value) || !record(value.metrics)) return false;
  const m = value.metrics;
  // Required: as_of, source. Every numeric feature is optional (may be null).
  return (
    shortString(value.user_id, 64) &&
    shortString(value.insight_id) &&
    shortString(value.snapshot_id) &&
    value.trigger_type === "investment_nudge" &&
    shortString(value.as_of, 64) &&
    Number.isFinite(Date.parse(value.as_of)) &&
    shortString(m.as_of, 64) &&
    m.source === "estimated"
  );
}

// ─── response validation ──────────────────────────────────────────────────────

const VALID_PRODUCT_IDS = new Set(["m-sinh-loi", "tiet-kiem"]);

function validJarBurnResponse(
  value: unknown,
  snapshotId: string,
): value is { snapshot_id: string; explanation: string; suggested_action: string } {
  if (!record(value)) return false;
  const { explanation, suggested_action } = value;
  return (
    value.snapshot_id === snapshotId &&
    shortString(explanation, 500) &&
    shortString(suggested_action, 300) &&
    !/[0-9]/.test(`${explanation} ${suggested_action}`)
  );
}

function validInvestmentResponse(
  value: unknown,
  snapshotId: string,
): value is {
  snapshot_id: string;
  product_id: "m-sinh-loi" | "tiet-kiem" | null;
  explanation: string;
  suggested_action: string;
} {
  if (!record(value)) return false;
  const { explanation, suggested_action, product_id } = value;
  const validProduct =
    product_id === null ||
    (typeof product_id === "string" && VALID_PRODUCT_IDS.has(product_id));
  return (
    value.snapshot_id === snapshotId &&
    validProduct &&
    shortString(explanation, 500) &&
    shortString(suggested_action, 300) &&
    !/[0-9]/.test(`${explanation} ${suggested_action}`)
  );
}

// ─── handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    const body = await req.text();
    if (body.length > 32_768)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!record(payload)) {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const triggerType = payload.trigger_type;
  const snapshotId = payload.snapshot_id as string;

  if (triggerType === "jar_burn") {
    if (!validJarBurnRequest(payload)) {
      return NextResponse.json({ error: "Invalid jar_burn request" }, { status: 422 });
    }
    try {
      const res = await fetch(INSIGHT_URL, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ ...(payload as Record<string, unknown>), task: JAR_BURN_TASK }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok)
        return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
      const data: unknown = await res.json();
      if (!validJarBurnResponse(data, snapshotId))
        return NextResponse.json({ error: "Invalid agent response" }, { status: 502 });
      return NextResponse.json({
        snapshot_id: data.snapshot_id,
        explanation: data.explanation,
        suggested_action: data.suggested_action,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      return NextResponse.json(
        { error: timedOut ? "Agent timeout" : "Agent unavailable" },
        { status: timedOut ? 504 : 502 },
      );
    }
  }

  if (triggerType === "investment_nudge") {
    if (!validInvestmentRequest(payload)) {
      return NextResponse.json({ error: "Invalid investment_nudge request" }, { status: 422 });
    }
    try {
      const res = await fetch(INSIGHT_URL, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ ...(payload as Record<string, unknown>), task: INVESTMENT_TASK }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok)
        return NextResponse.json({ error: `Agent API error ${res.status}` }, { status: 502 });
      const data: unknown = await res.json();
      if (!validInvestmentResponse(data, snapshotId))
        return NextResponse.json({ error: "Invalid agent response" }, { status: 502 });
      return NextResponse.json({
        snapshot_id: data.snapshot_id,
        product_id: data.product_id,
        explanation: data.explanation,
        suggested_action: data.suggested_action,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      return NextResponse.json(
        { error: timedOut ? "Agent timeout" : "Agent unavailable" },
        { status: timedOut ? 504 : 502 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown trigger_type" }, { status: 422 });
}
