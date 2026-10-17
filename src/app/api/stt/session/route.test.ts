// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function request(origin = "http://localhost:3000", keyterms?: unknown[]) {
  return new NextRequest("http://localhost:3000/api/stt/session", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: keyterms ? JSON.stringify({ keyterms }) : undefined,
  });
}
beforeEach(() => {
  vi.stubEnv("STT_API_BASE_URL", "https://speech.example.com");
  vi.stubEnv("STT_SERVICE_API_KEY", "private-server-key");
  vi.stubEnv("APP_ORIGIN", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("STT ticket proxy", () => {
  it("keeps the service key on the server and returns a WSS URL plus ticket", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ token: "short-ticket", expires_in: 60, sample_rate: 16000, format: "pcm_s16le", channels: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request());
    const body = await response.json();
    expect(body).toEqual({ token: "short-ticket", websocket_url: "wss://speech.example.com/api/v1/transcriptions/stream", expires_in: 60 });
    expect(JSON.stringify(body)).not.toContain("private-server-key");
    expect(fetchMock.mock.calls[0][1].headers["x-api-key"]).toBe("private-server-key");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ origin: "http://localhost:3000", keyterms: [] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("sanitizes and forwards the current jar vocabulary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      token: "ticket", sample_rate: 16000, format: "pcm_s16le", channels: 1,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request("http://localhost:3000", [
      " hũ Ăn uống ", "hũ Ăn uống", "", 42, "x".repeat(65), "hũ Tiết kiệm",
    ]));
    expect(response.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).keyterms).toEqual(["hũ Ăn uống", "hũ Tiết kiệm"]);
  });
  it("rejects cross-origin requests before contacting STT", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request("https://evil.example.com"))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts localhost and 127.0.0.1 as equivalent local origins", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      token: "ticket", sample_rate: 16000, format: "pcm_s16le", channels: 1,
    })));
    expect((await POST(request("http://127.0.0.1:3000"))).status).toBe(200);
  });
  it("explains that the old deployed image needs streaming support", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("streaming");
  });
  it("supports a configured public origin behind a reverse proxy", async () => {
    vi.stubEnv("APP_ORIGIN", "https://pfm.example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ token: "ticket", sample_rate: 16000, format: "pcm_s16le", channels: 1 })));
    expect((await POST(request("https://pfm.example.com"))).status).toBe(200);
  });
  it("fails clearly when STT is not configured or unavailable", async () => {
    vi.stubEnv("STT_API_BASE_URL", "");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("STT_API_BASE_URL", "https://speech.example.com");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret upstream detail")));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret upstream detail");
  });
});
