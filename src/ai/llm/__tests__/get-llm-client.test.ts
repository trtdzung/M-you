import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// `src/ai/llm/index.ts` (and the adapter it imports) do `import "server-only"`,
// whose real module throws outside a Server Component — mock it so the module
// loads under vitest.
vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.LLM_PROVIDER;
  delete process.env.AI_PLATFORM_API_KEY;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getLlmClient — provider resolution", () => {
  it("LLM_PROVIDER=none returns null", async () => {
    process.env.LLM_PROVIDER = "none";
    process.env.AI_PLATFORM_API_KEY = "key-that-should-be-ignored";
    const { getLlmClient } = await import("../index");
    expect(getLlmClient()).toBeNull();
  });

  it("LLM_PROVIDER=off returns null", async () => {
    process.env.LLM_PROVIDER = "off";
    process.env.AI_PLATFORM_API_KEY = "key-that-should-be-ignored";
    const { getLlmClient } = await import("../index");
    expect(getLlmClient()).toBeNull();
  });

  it("LLM_PROVIDER=vng WITHOUT AI_PLATFORM_API_KEY returns null (offline fallback)", async () => {
    process.env.LLM_PROVIDER = "vng";
    const { getLlmClient } = await import("../index");
    expect(getLlmClient()).toBeNull();
  });

  it("LLM_PROVIDER=vng WITH a key returns a non-null client defaulting to qwen/qwen3.6-flash", async () => {
    process.env.LLM_PROVIDER = "vng";
    process.env.AI_PLATFORM_API_KEY = "sk-vng-1";
    const { getLlmClient } = await import("../index");
    const client = getLlmClient();
    expect(client).not.toBeNull();
    expect(client?.model).toBe("qwen/qwen3.6-flash");
  });

  it("LLM_MODEL overrides the default model for the vng client", async () => {
    process.env.LLM_PROVIDER = "vng";
    process.env.AI_PLATFORM_API_KEY = "sk-vng-1";
    process.env.LLM_MODEL = "qwen/custom-model";
    const { getLlmClient } = await import("../index");
    const client = getLlmClient();
    expect(client?.model).toBe("qwen/custom-model");
  });

  it("unset LLM_PROVIDER + AI_PLATFORM_API_KEY set infers vng (non-null)", async () => {
    process.env.AI_PLATFORM_API_KEY = "sk-vng-1";
    const { getLlmClient } = await import("../index");
    expect(getLlmClient()).not.toBeNull();
  });

  it("unset LLM_PROVIDER + no key infers anthropic, which has no adapter yet (null)", async () => {
    const { getLlmClient } = await import("../index");
    expect(getLlmClient()).toBeNull();
  });

  it("LLM_PROVIDER=anthropic explicitly also returns null (no adapter yet), warning once server-side", async () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.AI_PLATFORM_API_KEY = "sk-vng-1"; // present but ignored by this branch
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { getLlmClient } = await import("../index");
      expect(getLlmClient()).toBeNull();
      expect(warnSpy).toHaveBeenCalled(); // footgun guard: key set but no adapter for this provider
    } finally {
      warnSpy.mockRestore();
    }
  });
});
