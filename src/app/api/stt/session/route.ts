import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LOCAL_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const SUPPORTED_INTENTS = new Set(["transfer_between_jars"]);

interface ContextEntity {
  id: string;
  type: string;
  label: string;
  aliases: string[];
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ");
  return clean && clean.length <= maxLength && !/[\u0000-\u001f]/.test(clean) ? clean : null;
}

function sanitizeEntities(value: unknown): ContextEntity[] {
  if (!Array.isArray(value)) return [];
  const entities: ContextEntity[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const id = cleanText(candidate.id, 64);
    const type = cleanText(candidate.type, 32);
    const label = cleanText(candidate.label, 64);
    if (!id || !type || !label || !/^[A-Za-z0-9._:-]+$/.test(id) || !/^[a-z][a-z0-9_]*$/.test(type) || seen.has(id)) continue;
    const aliases = Array.isArray(candidate.aliases)
      ? candidate.aliases.map((alias) => cleanText(alias, 64)).filter((alias): alias is string => Boolean(alias)).slice(0, 5)
      : [];
    seen.add(id);
    entities.push({ id, type, label, aliases: [...new Set(aliases)] });
  }
  return entities;
}

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
    let entities: ContextEntity[] = [];
    let intents: string[] = [];
    try {
      const payload: unknown = await req.json();
      if (payload && typeof payload === "object") {
        const requestedEndpointing = (payload as { endpointing?: unknown }).endpointing;
        if (requestedEndpointing === "manual" || requestedEndpointing === "silence") endpointing = requestedEndpointing;
        entities = sanitizeEntities((payload as { entities?: unknown }).entities);
        const requestedIntents = (payload as { intents?: unknown }).intents;
        if (Array.isArray(requestedIntents)) {
          intents = [...new Set(requestedIntents.filter(
            (intent): intent is string => typeof intent === "string" && SUPPORTED_INTENTS.has(intent),
          ))].slice(0, 10);
        }
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
      body: JSON.stringify({ origin, keyterms, endpointing, entities, intents }),
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
