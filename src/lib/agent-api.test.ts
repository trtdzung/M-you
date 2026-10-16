import { describe, it, expect, vi, afterEach } from "vitest";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("sendChatMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the same-origin agent-chat proxy with the message and cif as user_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ answer: "hi", thread_id: "CIF_0001" }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendChatMessage } = await import("./agent-api");
    const result = await sendChatMessage("hello", "CIF_0001");

    expect(result).toEqual({ answer: "hi", thread_id: "CIF_0001" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agent/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ message: "hello", user_id: "CIF_0001" });
  });

  it("throws when the proxy responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    vi.stubGlobal("fetch", fetchMock);

    const { sendChatMessage } = await import("./agent-api");
    await expect(sendChatMessage("hello", "CIF_0001")).rejects.toThrow("Agent API error 502");
  });
});

describe("getChatHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the same-origin agent-chat proxy with cif as the user_id query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ thread_id: "CIF_0001", messages: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { getChatHistory } = await import("./agent-api");
    const result = await getChatHistory("CIF_0001");

    expect(result).toEqual({ thread_id: "CIF_0001", messages: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/chat?user_id=CIF_0001");
  });

  it("throws when the proxy responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    vi.stubGlobal("fetch", fetchMock);

    const { getChatHistory } = await import("./agent-api");
    await expect(getChatHistory("CIF_0001")).rejects.toThrow("Agent API error 502");
  });
});

describe("deleteChatHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETEs the same-origin agent-chat proxy with cif as the user_id query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ thread_id: "CIF_0001", status: "deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    const { deleteChatHistory } = await import("./agent-api");
    await deleteChatHistory("CIF_0001");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agent/chat?user_id=CIF_0001");
    expect(init.method).toBe("DELETE");
  });

  it("throws when the proxy responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    vi.stubGlobal("fetch", fetchMock);

    const { deleteChatHistory } = await import("./agent-api");
    await expect(deleteChatHistory("CIF_0001")).rejects.toThrow("Agent API error 502");
  });
});
