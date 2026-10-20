// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

describe("Closing prices — candle cutoff at 15:00 VN, ensurePricesFresh schedule rules, refreshPricesNow", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => {
    fx.close();
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    fx.db.prepare("DELETE FROM gv2_price_sync").run();
  });

  describe("Candle cutoff by time of day", () => {
    it("with a dchart response containing candles for 16/10, 17/10 and today 19/10/2026: at 10:00 VN drop today's candle; at 15:30 VN it is kept", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { lookupStock, fetchStocks } = await import("../prices/sources");

      // Timestamps for Vietnam 15:00 close on 16/10, 17/10, and 19/10/2026
      const t = [
        Math.floor(Date.parse("2026-10-16T00:00:00+07:00") / 1000) + 15 * 3600,
        Math.floor(Date.parse("2026-10-17T00:00:00+07:00") / 1000) + 15 * 3600,
        Math.floor(Date.parse("2026-10-19T00:00:00+07:00") / 1000) + 15 * 3600,
      ];
      const c = [25.0, 25.5, 26.0];

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          return new Response(JSON.stringify({ s: "ok", t, c }), { status: 200 });
        }),
      );

      // 1. At 10:00 VN (UTC+7) -> today's candle (19/10) must be dropped
      const morningNow = new Date("2026-10-19T10:00:00+07:00");
      vi.setSystemTime(morningNow);

      const lookupMorning = await lookupStock("HPG", morningNow);
      expect(lookupMorning.status).toBe("ok");
      if (lookupMorning.status === "ok") {
        const dates = lookupMorning.points.map((p) => p.priceDate);
        expect(dates).toContain("2026-10-16");
        expect(dates).toContain("2026-10-17");
        expect(dates).not.toContain("2026-10-19");
      }

      const stocksMorning = await fetchStocks(morningNow, () => "2026-10-01", ["HPG"]);
      const morningDates = stocksMorning.points
        .filter((p) => p.instrumentId === "stock-hpg")
        .map((p) => p.priceDate);
      expect(morningDates).toContain("2026-10-16");
      expect(morningDates).toContain("2026-10-17");
      expect(morningDates).not.toContain("2026-10-19");

      // 2. At 15:30 VN (UTC+7) -> today's candle (19/10) must be kept
      const afternoonNow = new Date("2026-10-19T15:30:00+07:00");
      vi.setSystemTime(afternoonNow);

      const lookupAfternoon = await lookupStock("HPG", afternoonNow);
      expect(lookupAfternoon.status).toBe("ok");
      if (lookupAfternoon.status === "ok") {
        const dates = lookupAfternoon.points.map((p) => p.priceDate);
        expect(dates).toContain("2026-10-16");
        expect(dates).toContain("2026-10-17");
        expect(dates).toContain("2026-10-19");
      }

      const stocksAfternoon = await fetchStocks(afternoonNow, () => "2026-10-01", ["HPG"]);
      const afternoonDates = stocksAfternoon.points
        .filter((p) => p.instrumentId === "stock-hpg")
        .map((p) => p.priceDate);
      expect(afternoonDates).toContain("2026-10-16");
      expect(afternoonDates).toContain("2026-10-17");
      expect(afternoonDates).toContain("2026-10-19");
    });
  });

  describe("ensurePricesFresh schedule rules", () => {
    it("ensurePricesFresh (non-forced): one run before 15:00 VN; one more allowed after 15:00 VN if today's run started before 15:00; then none. refreshPricesNow always claims (2-minute lock aside)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { ensurePricesFresh, refreshPricesNow } = await import("../prices/sync");

      // Block network so background syncs don't make external calls
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("test mock network block");
        }),
      );

      const countRuns = () =>
        (fx.db.prepare("SELECT COUNT(*) AS c FROM gv2_price_sync").get() as { c: number }).c;

      // 1. Morning at 10:00 VN: First run is allowed
      vi.setSystemTime(new Date("2026-10-19T10:00:00+07:00"));
      expect(countRuns()).toBe(0);

      ensurePricesFresh();
      expect(countRuns()).toBe(1);

      // Finish the morning run with status 'ok'
      fx.db.prepare("UPDATE gv2_price_sync SET status = 'ok', finished_at = ?").run(new Date().toISOString());

      // Calling again at 11:00 VN before 15:00 -> already had a run today, none allowed
      vi.setSystemTime(new Date("2026-10-19T11:00:00+07:00"));
      ensurePricesFresh();
      expect(countRuns()).toBe(1);

      // 2. Afternoon at 15:30 VN: One more run allowed because morning run started before 15:00
      vi.setSystemTime(new Date("2026-10-19T15:30:00+07:00"));
      ensurePricesFresh();
      expect(countRuns()).toBe(2);

      // Finish the afternoon run with status 'ok'
      fx.db
        .prepare("UPDATE gv2_price_sync SET status = 'ok', finished_at = ? WHERE id = (SELECT MAX(id) FROM gv2_price_sync)")
        .run(new Date().toISOString());

      // Calling again at 16:00 VN after 15:00 -> already had an afternoon run, none allowed
      vi.setSystemTime(new Date("2026-10-19T16:00:00+07:00"));
      ensurePricesFresh();
      expect(countRuns()).toBe(2);

      // Calling again at 18:00 VN -> still none allowed
      vi.setSystemTime(new Date("2026-10-19T18:00:00+07:00"));
      ensurePricesFresh();
      expect(countRuns()).toBe(2);

      // 3. refreshPricesNow always claims (2-minute lock aside)
      // Call at 18:05 VN (> 2 minutes after last run): claims run #3
      vi.setSystemTime(new Date("2026-10-19T18:05:00+07:00"));
      refreshPricesNow();
      expect(countRuns()).toBe(3);

      // Immediate call 30s later (at 18:05:30 VN, within 2-minute lock): locked, does not claim
      vi.setSystemTime(new Date("2026-10-19T18:05:30+07:00"));
      refreshPricesNow();
      expect(countRuns()).toBe(3);

      // Advance past 2 minutes (at 18:08:00 VN): finish previous running row, refreshPricesNow claims run #4
      fx.db
        .prepare("UPDATE gv2_price_sync SET status = 'ok', finished_at = ? WHERE id = (SELECT MAX(id) FROM gv2_price_sync)")
        .run(new Date().toISOString());

      vi.setSystemTime(new Date("2026-10-19T18:08:00+07:00"));
      refreshPricesNow();
      expect(countRuns()).toBe(4);
    });
  });
});
