import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// `openai-compatible-client.ts` does `import "server-only"`, whose real module
// throws when loaded outside a Server Component (see node_modules/server-only
// /index.js). Mock it so the adapter loads under vitest's node/jsdom runtime.
vi.mock("server-only", () => ({}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("createOpenAiCompatibleClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to <baseUrl>/chat/completions with a trimmed trailing slash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "dining" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1/", apiKey: "sk-1", model: "qwen/test" });
    await client.complete([{ role: "user", content: "hi" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://maas.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-1");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends the model + messages and defaults temperature to 0 (no response_format when not requested)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1", apiKey: "sk-1", model: "qwen/test" });
    const messages = [
      { role: "system" as const, content: "system prompt" },
      { role: "user" as const, content: "user prompt" },
    ];
    await client.complete(messages);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("qwen/test");
    expect(body.messages).toEqual(messages);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toBeUndefined();
  });

  it("includes response_format:{type:json_object} when options.json is true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "{}" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1", apiKey: "sk-1", model: "qwen/test" });
    await client.complete([{ role: "user", content: "hi" }], { json: true, temperature: 0.3, maxTokens: 50 });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(50);
  });

  it("returns choices[0].message.content on a 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "dining" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1", apiKey: "sk-1", model: "qwen/test" });
    const content = await client.complete([{ role: "user", content: "hi" }]);
    expect(content).toBe("dining");
  });

  it("throws on a non-2xx response, and the message includes the status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1", apiKey: "sk-1", model: "qwen/test" });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(/500/);
  });

  it("throws when content is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1", apiKey: "sk-1", model: "qwen/test" });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(/empty/i);
  });

  it("throws when content is an empty string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1", apiKey: "sk-1", model: "qwen/test" });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(/empty/i);
  });

  it("throws when content is not a string (e.g. an object)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: { not: "a string" } } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiCompatibleClient } = await import("../openai-compatible-client");

    const client = createOpenAiCompatibleClient({ baseUrl: "https://maas.example.com/v1", apiKey: "sk-1", model: "qwen/test" });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(/empty/i);
  });
});
