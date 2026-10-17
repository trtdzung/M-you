// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const service = vi.hoisted(() => ({ generateHomeInsight: vi.fn(), homeInsightEvent: vi.fn() }));
vi.mock("@/lib/home-insight-service", () => service);
import { POST } from "./route";
const call = (body: unknown) => POST(new NextRequest("http://local/api/proactive-insights/current", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
beforeEach(() => { vi.resetAllMocks(); service.generateHomeInsight.mockResolvedValue({ insight: null, cached: false }); });
describe("Home API boundary", () => {
  it("rejects unknown persona before model or DB access", async () => {
    expect((await call({ cif: "CIF_OTHER" })).status).toBe(422);
    expect(service.generateHomeInsight).not.toHaveBeenCalled();
  });
  it("forwards validated identity and disables response caching", async () => {
    const response = await call({ cif: "CIF_0001" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(service.generateHomeInsight).toHaveBeenCalledWith("CIF_0001", { cif: "CIF_0001" });
  });
  it("rejects malformed interactions and maps validation failures", async () => {
    expect((await call({ cif: "CIF_0001", event: "dismissed", snapshotId: "bad" })).status).toBe(422);
    expect(service.homeInsightEvent).not.toHaveBeenCalled();
    service.generateHomeInsight.mockRejectedValue(new RangeError("bad profile"));
    expect((await call({ cif: "CIF_0001" })).status).toBe(422);
  });
  it("rejects oversized payloads", async () => {
    expect((await call({ cif: "CIF_0001", text: "x".repeat(128000) })).status).toBe(413);
    expect(service.generateHomeInsight).not.toHaveBeenCalled();
  });
});
