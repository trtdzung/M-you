import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("returns parsed data for 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ goals: [] }), { status: 200 }),
    );
    await expect(fetchJson<{ goals: unknown[] }>("/api/goals")).resolves.toEqual({
      ok: true,
      data: { goals: [] },
    });
  });

  it("returns undefined data for 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(fetchJson<undefined>("/api/goals/1")).resolves.toEqual({
      ok: true,
      data: undefined,
    });
  });

  it("returns status, error and field errors for 422 and 404", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: { name: "sai" }, error: "invalid" }), { status: 422 }),
    );
    await expect(fetchJson("/api/goals")).resolves.toEqual({
      ok: false,
      status: 422,
      error: "invalid",
      errors: { name: "sai" },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );
    await expect(fetchJson("/api/goals/1")).resolves.toEqual({
      ok: false,
      status: 404,
      error: "not found",
      errors: undefined,
    });
  });

  it("keeps a non-JSON error body from throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchJson("/api/goals")).resolves.toEqual({
      ok: false,
      status: 500,
      error: undefined,
      errors: undefined,
    });
  });

  it("turns a thrown fetch into status 0", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(fetchJson("/api/goals")).resolves.toEqual({ ok: false, status: 0 });
  });
});
