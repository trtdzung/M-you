import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LOCAL_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

function isAllowedOrigin(origin: string | null, expectedOrigin: string): origin is string {
  if (!origin) return false;
  if (origin === expectedOrigin) return true;
  return LOCAL_ORIGINS.has(origin) && LOCAL_ORIGINS.has(expectedOrigin);
}

// This proxy is compatible with Next standalone/serverless: only ticket
// creation uses HTTP. Audio goes from the browser to the STT WebSocket.
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expectedOrigin = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (!isAllowedOrigin(origin, expectedOrigin)) {
    return NextResponse.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  const base = process.env.STT_API_BASE_URL;
  if (!base) {
    return NextResponse.json({ error: "Chưa cấu hình dịch vụ nhập giọng nói." }, { status: 503 });
  }
  try {
    let keyterms: string[] = [];
    let endpointing: "silence" | "manual" = "silence";
    try {
      const payload: unknown = await req.json();
      if (payload && typeof payload === "object") {
        const requestedEndpointing = (payload as { endpointing?: unknown }).endpointing;
        if (requestedEndpointing === "manual" || requestedEndpointing === "silence") endpointing = requestedEndpointing;
      }
      if (payload && typeof payload === "object" && Array.isArray((payload as { keyterms?: unknown }).keyterms)) {
        const seen = new Set<string>();
        keyterms = (payload as { keyterms: unknown[] }).keyterms
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim().replace(/\s+/g, " "))
          .filter((value) => value.length > 0 && value.length <= 64)
          .filter((value) => {
            const key = value.toLocaleLowerCase("vi");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 20);
      }
    } catch {
      // Older clients sent an empty POST body; keep that path compatible.
    }
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid STT URL");
    const response = await fetch(new URL("/api/v1/stream-sessions", url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.STT_SERVICE_API_KEY ? { "x-api-key": process.env.STT_SERVICE_API_KEY } : {}),
      },
      body: JSON.stringify({ origin, keyterms, endpointing }),
      cache: "no-store",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(10_000)]),
      redirect: "error",
    });
    if (!response.ok) {
      const error = response.status === 404
        ? "Endpoint STT chưa được cập nhật phiên bản hỗ trợ streaming."
        : response.status === 429
          ? "Bạn đã mở quá nhiều phiên ghi âm. Vui lòng thử lại sau."
          : "Không tạo được phiên ghi âm. Vui lòng kiểm tra cấu hình STT.";
      return NextResponse.json({ error }, { status: response.status === 429 ? 429 : 502 });
    }
    const session = await response.json();
    if (typeof session.token !== "string" || session.sample_rate !== 16000 || session.format !== "pcm_s16le" || session.channels !== 1) {
      throw new Error("Invalid STT session");
    }
    const websocket = new URL("/api/v1/transcriptions/stream", url);
    websocket.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return NextResponse.json({
      token: session.token, websocket_url: websocket.toString(), expires_in: session.expires_in,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Không kết nối được dịch vụ giọng nói. Vui lòng thử lại." }, { status: 502 });
  }
}
