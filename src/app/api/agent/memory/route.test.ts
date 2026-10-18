import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function req(method: "GET" | "DELETE", params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/agent/memory?${qs}`, { method });
}

describe("/api/agent/memory", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.AGENT_API_BASE_URL = "http://test-base";
    process.env.AGENT_API_KEY = "test-key";
    delete process.env.AUTH0_DOMAIN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("GET rejects a request without user_id", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("GET", {}));
    expect(res.status).toBe(422);
  });

  it("GET forwards to /memory/preferences with user_id and X-API-Key", async () => {
    const body = { user_id: "CIF_0001", records: [{ id: "r1", fact: "Thích đá banh", created_at: null }] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const res = await GET(req("GET", { user_id: "CIF_0001" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-base/memory/preferences?user_id=CIF_0001");
    expect(init.headers["X-API-Key"]).toBe("test-key");
  });

  it("GET maps an agent error to 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    const { GET } = await import("./route");
    const res = await GET(req("GET", { user_id: "CIF_0001" }));
    expect(res.status).toBe(502);
  });

  it("DELETE rejects a request without user_id or record_id", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(req("DELETE", { user_id: "CIF_0001" }))).status).toBe(422);
    expect((await DELETE(req("DELETE", { record_id: "r1" }))).status).toBe(422);
  });

  it("DELETE forwards to /memory/preferences/{record_id} with user_id", async () => {
    const body = { user_id: "CIF_0001", record_id: "r1", status: "deleted" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE", { user_id: "CIF_0001", record_id: "r1" }));

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-base/memory/preferences/r1?user_id=CIF_0001");
    expect(init.method).toBe("DELETE");
    expect(init.headers["X-API-Key"]).toBe("test-key");
  });

  it("DELETE passes the agent's 404 (record not owned) through as 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 404)));
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE", { user_id: "CIF_0001", record_id: "other" }));
    expect(res.status).toBe(404);
  });
});
