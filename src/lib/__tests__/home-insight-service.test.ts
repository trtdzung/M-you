// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));
vi.mock("@/lib/agent-proxy-auth", () => ({ AGENT_BASE_URL: "http://agent", agentAuthHeaders: async () => ({ "X-API-Key": "test" }) }));
import { customerSnapshot, snapshotHash } from "../financial-snapshot-service";
import { generateHomeInsight, homeInsightEvent } from "../home-insight-service";
const input = { profile: { assets: [], liabilities: [], goals: [], complete: true } };
beforeEach(() => { holder.db = new Database(":memory:"); holder.db.exec(readFileSync("data/schema.sql", "utf8")); });
afterEach(() => { holder.db?.close(); vi.unstubAllGlobals(); });

describe("snapshot and insight cache integration", () => {
  it("hash is stable, persona scoped, and validates self reported provenance", () => {
    const a = customerSnapshot("CIF_0001", input);
    expect(customerSnapshot("CIF_0001", input).snapshotId).toBe(a.snapshotId);
    expect(snapshotHash("other", a.snapshot)).not.toBe(a.snapshotId);
    expect(JSON.stringify(a.snapshot).length).toBeLessThan(350000);
    expect(() => customerSnapshot("CIF_0001", { profile: { assets: [{ id: "forged", source: "msb" }] } })).toThrow(RangeError);
    expect(() => customerSnapshot("CIF_0001", { topups: [{ jarId: "invalid", amount: 10 }] })).toThrow(RangeError);
  });
  it("sends all snapshot domains, caches model output and scopes dismissal", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body.snapshot.accounts).toBeDefined();
      expect(body.snapshot.cashflow.daily).toHaveLength(30);
      expect(body.snapshot.transactions.length).toBeGreaterThan(0);
      return { ok: true, json: async () => ({ snapshot_id: body.snapshot_id,
        candidate_id: body.snapshot.candidates[0].id, title: "Xem tình hình tài chính", body: "Cùng xem khoản cần ưu tiên." }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const a = await generateHomeInsight("CIF_0001", input);
    expect(a.insight?.source).toBe("agent");
    expect((await generateHomeInsight("CIF_0001", input)).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(homeInsightEvent("CIF_0002", a.insight!.snapshotId, "dismissed")).toBe(false);
    expect(homeInsightEvent("CIF_0001", a.insight!.snapshotId, "dismissed")).toBe(true);
    expect(await generateHomeInsight("CIF_0001", input)).toMatchObject({ insight: null, reason: "dismissed" });
  });
  it("deduplicates simultaneous requests and falls back on invalid model output", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ title: "Có 99 triệu" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([generateHomeInsight("CIF_0001", input), generateHomeInsight("CIF_0001", input)]);
    expect(a.insight?.source).toBe("fallback");
    expect(b.insight).toEqual(a.insight);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("falls back when upstream is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await generateHomeInsight("CIF_0001", input)).insight?.source).toBe("fallback");
  });
});
