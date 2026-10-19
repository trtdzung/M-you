// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { openGoalFixtureDb, vnToday, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { POST } from "@/app/api/goals-v2/market/instruments/route";
import { ensurePricesFresh } from "../prices/sync";

process.env.AGENT_MODE = "mock";

describe("POST /api/goals-v2/market/instruments + R1 khoá sync", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("có dữ liệu → 200; không → 422; lỗi mạng → 502 (mock fetch)", async () => {
    let mode: "ok" | "empty" | "error" = "ok";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (mode === "error") throw new Error("independent network failure");
        if (mode === "empty") return new Response("");
        return new Response(JSON.stringify({ s: "ok", t: [1756688400, 1756774800], c: [90, 91] }));
      }),
    );

    mode = "ok";
    let res = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ symbol: "DGC" }) }));
    expect(res.status).toBe(200);
    const okBody = await res.json();
    expect(okBody.instrument.id).toBe("stock-dgc");
    expect(okBody.instrument.priceSeries.length).toBeGreaterThan(0);

    mode = "empty";
    res = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ symbol: "ZZZZQ" }) }));
    expect(res.status).toBe(422);

    mode = "error";
    res = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ symbol: "DGC" }) }));
    expect(res.status).toBe(502);
  });

  it("R1: chỉ một lượt sync chạy khi đã có khoá running", async () => {
    fx.db.prepare("DELETE FROM gv2_price_sync").run();
    // Chặn mạng: mọi fetch fail ngay; chờ sync nền kết thúc trước khi đóng DB.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("no network in test");
      }),
    );
    const first = ensurePricesFresh();
    expect(first.refreshing).toBe(true);
    const running1 = (
      fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_price_sync WHERE status = 'running'").get() as { n: number }
    ).n;
    expect(running1).toBe(1);
    const second = ensurePricesFresh();
    expect(second.refreshing).toBe(true);
    const running2 = (
      fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_price_sync WHERE status = 'running'").get() as { n: number }
    ).n;
    expect(running2).toBe(1);
    // Đợi lượt nền đóng dòng running (fetch fail → failed).
    await vi.waitFor(() => {
      const n = (
        fx.db.prepare("SELECT COUNT(*) AS n FROM gv2_price_sync WHERE status = 'running'").get() as { n: number }
      ).n;
      expect(n).toBe(0);
    });
    fx.db.prepare("DELETE FROM gv2_price_sync").run();
    fx.db
      .prepare("INSERT INTO gv2_price_sync (sync_date, started_at, finished_at, status) VALUES (?, ?, ?, 'ok')")
      .run(vnToday(), new Date().toISOString(), new Date().toISOString());
  });
});
