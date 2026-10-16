import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 150;

const LOCAL_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

function isAllowedOrigin(origin: string | null, expectedOrigin: string): origin is string {
  if (!origin) return false;
  if (origin === expectedOrigin) return true;
  return LOCAL_ORIGINS.has(origin) && LOCAL_ORIGINS.has(expectedOrigin);
}

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
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid STT URL");
    const incoming = await req.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof File) || audio.size < 44 || audio.size > MAX_AUDIO_BYTES || audio.type !== "audio/wav") {
      return NextResponse.json({ error: "Bản ghi âm không hợp lệ hoặc quá dài." }, { status: 400 });
    }

    const body = new FormData();
    body.append("audio", audio, "recording.wav");
    body.append("language", "vie");
    const response = await fetch(new URL("/api/v1/transcriptions", url), {
      method: "POST",
      headers: process.env.STT_SERVICE_API_KEY ? { "x-api-key": process.env.STT_SERVICE_API_KEY } : {},
      body,
      cache: "no-store",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(130_000)]),
      redirect: "error",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = response.status === 401 || response.status === 403
        ? "Cấu hình xác thực STT không hợp lệ."
        : response.status === 413
          ? "Bản ghi âm quá dài. Hãy thử lại với câu ngắn hơn."
          : response.status === 422
            ? "Chưa nghe rõ giọng nói. Vui lòng thử lại."
            : response.status === 429
              ? "Dịch vụ nhận dạng đang bận. Vui lòng thử lại sau."
              : response.status === 504
                ? "Dịch vụ nhận dạng phản hồi quá chậm. Vui lòng thử lại."
                : "Dịch vụ giọng nói chưa xử lý được bản ghi âm.";
      return NextResponse.json({ error }, { status: response.status === 429 ? 429 : 502 });
    }
    if (typeof payload.text !== "string" || !payload.text.trim()) {
      throw new Error("Invalid STT response");
    }
    return NextResponse.json({ text: payload.text.trim() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Dịch vụ nhận dạng phản hồi quá chậm. Vui lòng thử lại." }, { status: 504 });
    }
    return NextResponse.json({ error: "Không kết nối được dịch vụ giọng nói. Vui lòng thử lại." }, { status: 502 });
  }
}
