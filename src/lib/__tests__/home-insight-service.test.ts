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

  it("returns carousel with healthScore, up to 2 distinct candidates and handles upstream assessment", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => ({
          snapshot_id: body.snapshot_id,
          candidate_id: body.snapshot.candidates[0].id,
          title: "Xem tình hình tài chính",
          body: "Cùng xem khoản cần ưu tiên.",
          health_score_assessment: {
            snapshot_id: body.snapshot_id,
            source: "agent",
            summary: "Tình hình tài chính nhìn chung ổn định với dòng tiền tốt.",
            pillar_assessments: [
              { pillar: "SPEND", status: "strength", explanation: "Tỷ lệ chi tiêu trên thu nhập hợp lý." },
              { pillar: "SAVE", status: "strength", explanation: "Dự phòng tiền mặt đạt trên 3 tháng." },
              { pillar: "BORROW", status: "watch", explanation: "Cần theo dõi nghĩa vụ trả nợ." },
            ],
            strengths: ["Dòng tiền dương"],
            areas_to_watch: ["Hạn mức tín dụng"],
            recommended_actions: ["Tối ưu tiền gửi"],
            data_limitations: ["Chưa có thông tin bảo hiểm"],
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await generateHomeInsight("CIF_0001", input);
    expect(res.healthScore).toBeDefined();
    expect(typeof res.healthScore.overallScore).toBe("number");
    expect(res.healthScore.policyVersion).toBe("pfm-health-v0");
    expect(res.insights.length).toBeGreaterThanOrEqual(1);
    expect(res.insights.length).toBeLessThanOrEqual(2);
    expect(res.insights[0].source).toBe("agent");
    if (res.insights.length > 1) {
      expect(res.insights[1].source).toBe("fallback");
      expect(res.insights[0].candidate.id).not.toBe(res.insights[1].candidate.id);
    }
    expect(res.healthAssessment).toBeDefined();
    expect(res.healthAssessment?.summary).toContain("Tình hình tài chính");
    expect(res.healthAssessment?.pillarAssessments).toHaveLength(3);
  });

  it("ignores upstream assessment when snapshot_id mismatches but retains candidate selection", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => ({
          snapshot_id: body.snapshot_id,
          candidate_id: body.snapshot.candidates[0].id,
          title: "Xem tình hình tài chính",
          body: "Cùng xem khoản cần ưu tiên.",
          health_score_assessment: {
            snapshot_id: "mismatched-id",
            source: "agent",
            summary: "Giả mạo id",
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await generateHomeInsight("CIF_0001", input);
    expect(res.insights[0].source).toBe("agent");
    expect(res.healthAssessment).toBeNull();
  });

  it("rebuilds legacy single-card cache entries safely", async () => {
    const { snapshot, snapshotId } = customerSnapshot("CIF_0001", input);
    const legacyCard = {
      snapshotId,
      candidate: snapshot.candidates[0],
      title: "Legacy title",
      body: "Legacy body",
      source: "agent",
      asOf: snapshot.asOf,
    };
    holder.db?.exec(`CREATE TABLE IF NOT EXISTS home_insight_cache (
      cif TEXT NOT NULL, snapshot_id TEXT NOT NULL, card_json TEXT NOT NULL, expires_at INTEGER NOT NULL,
      dismissed_until INTEGER NOT NULL DEFAULT 0, displayed_at INTEGER,
      PRIMARY KEY (cif, snapshot_id)
    )`);
    holder.db?.prepare(
      "INSERT INTO home_insight_cache (cif, snapshot_id, card_json, expires_at) VALUES (?, ?, ?, ?)"
    ).run("CIF_0001", snapshotId, JSON.stringify(legacyCard), Date.now() + 60_000);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await generateHomeInsight("CIF_0001", input);
    // Legacy single-card parsed was ignored, recomputed carousel with healthScore and insights
    expect(res.healthScore).toBeDefined();
    expect(Array.isArray(res.insights)).toBe(true);
  });
});
