// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => { vi.stubEnv("LOGIN_PASSWORD", "test-pass"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("POST /api/login", () => {
  it("accepts the configured password", async () => {
    const response = await POST(request({ password: "test-pass" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each(["wrong-one", "short", "longer-test-pass", "", undefined, null, 123])(
    "rejects an invalid password: %s",
    async (password) => {
      const response = await POST(request({ password }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false, error: "Sai mật khẩu, vui lòng thử lại" });
    },
  );

  it.each([undefined, ""])("fails when LOGIN_PASSWORD is missing or empty: %s", async (value) => {
    vi.stubEnv("LOGIN_PASSWORD", value);
    const response = await POST(request({ password: "test-pass" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Chưa cấu hình mật khẩu đăng nhập" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Sai mật khẩu, vui lòng thử lại" });
  });

  it("compares UTF-8 byte lengths safely", async () => {
    vi.stubEnv("LOGIN_PASSWORD", "tést-pass");
    expect((await POST(request({ password: "test-pass" }))).status).toBe(401);
    expect((await POST(request({ password: "tést-pass" }))).status).toBe(200);
  });
});
