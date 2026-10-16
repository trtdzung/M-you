// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function request(origin = "http://localhost:3000", audio = new File([new Uint8Array(100)], "recording.wav", { type: "audio/wav" })) {
  const form = new FormData();
  form.append("audio", audio);
  return new NextRequest("http://localhost:3000/api/stt/transcribe", { method: "POST", headers: { origin }, body: form });
}
beforeEach(() => {
  vi.stubEnv("STT_API_BASE_URL", "https://speech.example.com");
  vi.stubEnv("STT_SERVICE_API_KEY", "private-server-key");
  vi.stubEnv("APP_ORIGIN", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("batch STT proxy", () => {
  it("forwards one audio file with a server-only key and returns final text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: "Số dư của tôi", provider: "vbee" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request());
    expect(await response.clone().json()).toEqual({ text: "Số dư của tôi" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("https://speech.example.com/api/v1/transcriptions");
    expect(options.headers["x-api-key"]).toBe("private-server-key");
    expect((options.body as FormData).get("audio")).toBeInstanceOf(File);
    expect(JSON.stringify(await response.json())).not.toContain("private-server-key");
  });

  it("rejects cross-origin and invalid files before contacting STT", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request("https://evil.example.com"))).status).toBe(403);
    expect((await POST(request("http://localhost:3000", new File(["bad"], "bad.txt", { type: "text/plain" })))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts localhost aliases and masks upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream detail", { status: 503 })));
    const response = await POST(request("http://127.0.0.1:3000"));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("private upstream detail");
  });
});
