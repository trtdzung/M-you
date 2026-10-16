import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/agent/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getRequest(userId?: string) {
  const url = userId
    ? `http://localhost/api/agent/chat?user_id=${encodeURIComponent(userId)}`
    : "http://localhost/api/agent/chat";
  return new NextRequest(url);
}

describe("POST /api/agent/chat", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.AGENT_API_BASE_URL = "http://test-base";
    process.env.AGENT_API_KEY = "test-key";
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_CLIENT_SECRET;
    delete process.env.AUTH0_AUDIENCE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("rejects a request missing message or user_id", async () => {
    const { POST } = await import("./route");
    const res = await POST(postRequest({ message: "hi" }));
    expect(res.status).toBe(422);
  });

  describe("without Auth0 configured", () => {
    it("forwards the message with X-API-Key and no Authorization header", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ answer: "hi", thread_id: "CIF_0001" }));
      vi.stubGlobal("fetch", fetchMock);

      const { POST } = await import("./route");
      const res = await POST(postRequest({ message: "hello", user_id: "CIF_0001" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ answer: "hi", thread_id: "CIF_0001" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://test-base/chat");
      expect(init.headers).toEqual({ "Content-Type": "application/json", "X-API-Key": "test-key" });
      expect(JSON.parse(init.body)).toEqual({ message: "hello", user_id: "CIF_0001" });
    });

    it("returns a 502 when the agent API responds with a non-OK status", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
      vi.stubGlobal("fetch", fetchMock);

      const { POST } = await import("./route");
      const res = await POST(postRequest({ message: "hello", user_id: "CIF_0001" }));
      expect(res.status).toBe(502);
    });
  });

  describe("with Auth0 configured", () => {
    beforeEach(() => {
      process.env.AUTH0_DOMAIN = "auth.example.com";
      process.env.AUTH0_CLIENT_ID = "cid";
      process.env.AUTH0_CLIENT_SECRET = "csecret";
      process.env.AUTH0_AUDIENCE = "aud";
    });

    function stubTokenAndChat() {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === "https://auth.example.com/oauth/token") {
          return Promise.resolve(jsonResponse({ access_token: "tok123", expires_in: 3600 }));
        }
        return Promise.resolve(jsonResponse({ answer: "hi2", thread_id: "CIF_0002" }));
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("fetches a token first and attaches it as a Bearer header", async () => {
      const fetchMock = stubTokenAndChat();
      const { POST } = await import("./route");

      const res = await POST(postRequest({ message: "msg", user_id: "CIF_0002" }));
      const body = await res.json();

      expect(body).toEqual({ answer: "hi2", thread_id: "CIF_0002" });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
      expect(tokenUrl).toBe("https://auth.example.com/oauth/token");
      expect(JSON.parse(tokenInit.body)).toEqual({
        client_id: "cid",
        client_secret: "csecret",
        audience: "aud",
        grant_type: "client_credentials",
      });

      const [, chatInit] = fetchMock.mock.calls[1];
      expect(chatInit.headers).toEqual({
        "Content-Type": "application/json",
        "X-API-Key": "test-key",
        Authorization: "Bearer tok123",
      });
    });

    it("reuses the cached token on a second call instead of refetching", async () => {
      const fetchMock = stubTokenAndChat();
      const { POST } = await import("./route");

      await POST(postRequest({ message: "msg1", user_id: "CIF_0002" }));
      await POST(postRequest({ message: "msg2", user_id: "CIF_0002" }));

      // 1 token fetch + 2 chat calls = 3, not 4
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});

describe("GET /api/agent/chat", () => {
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

  it("rejects a request missing user_id", async () => {
    const { GET } = await import("./route");
    const res = await GET(getRequest());
    expect(res.status).toBe(422);
  });

  it("forwards to /chat/history with the user_id query param and X-API-Key header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ thread_id: "CIF_0001", messages: [{ role: "user", content: "hi", ui: null }] }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const res = await GET(getRequest("CIF_0001"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ thread_id: "CIF_0001", messages: [{ role: "user", content: "hi", ui: null }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-base/chat/history?user_id=CIF_0001");
    expect(init.headers).toEqual({ "X-API-Key": "test-key" });
  });

  it("returns a 502 when the agent API responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const res = await GET(getRequest("CIF_0001"));
    expect(res.status).toBe(502);
  });
});

describe("DELETE /api/agent/chat", () => {
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

  it("rejects a request missing user_id", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(getRequest());
    expect(res.status).toBe(422);
  });

  it("forwards a DELETE to /chat/history with the user_id query param and X-API-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ thread_id: "CIF_0001", status: "deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    const { DELETE } = await import("./route");
    const res = await DELETE(getRequest("CIF_0001"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ thread_id: "CIF_0001", status: "deleted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test-base/chat/history?user_id=CIF_0001");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ "X-API-Key": "test-key" });
  });

  it("returns a 502 when the agent API responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    const { DELETE } = await import("./route");
    const res = await DELETE(getRequest("CIF_0001"));
    expect(res.status).toBe(502);
  });
});
