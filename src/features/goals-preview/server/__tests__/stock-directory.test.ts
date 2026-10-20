// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (path: unknown, options: unknown) => {
      if (typeof path === "string" && path.includes("stock-directory.json")) {
        const items = Array.from({ length: 1005 }, (_, i) => ({
          code: `STK${i}`,
          companyName: `Công ty Cổ phần Thử nghiệm ${i}`,
          shortName: `S${i}`,
          floor: "HOSE",
        }));
        return JSON.stringify({
          fetchedAt: "2026-10-15T00:00:00.000Z",
          items,
        });
      }
      return actual.readFileSync(path as any, options as any);
    },
  };
});

describe("Stock directory — fetch, apply, ensure, seed, readMarketInstruments, registerStockSymbol", () => {
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
    fx.db.prepare("DELETE FROM gv2_stock_directory").run();
  });

  describe("fetchStockDirectory", () => {
    it("rejects when VNDirect returns < 1000 valid rows, HTTP 500, or a network error; nothing is written", async () => {
      const { fetchStockDirectory } = await import("../prices/directory");

      const countRows = () =>
        (fx.db.prepare("SELECT COUNT(*) AS c FROM gv2_stock_directory").get() as { c: number }).c;

      // 1. HTTP 500
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("Internal Server Error", { status: 500 })),
      );
      await expect(fetchStockDirectory()).rejects.toThrow(/HTTP 500/);
      expect(countRows()).toBe(0);

      // 2. Network error
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("VNDirect network timeout");
        }),
      );
      await expect(fetchStockDirectory()).rejects.toThrow(/VNDirect network timeout/);
      expect(countRows()).toBe(0);

      // 3. Less than 1000 valid rows (e.g. 500 rows)
      const fewRows = Array.from({ length: 500 }, (_, i) => ({
        code: `SYM${i}`,
        companyName: `Company ${i}`,
      }));
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ data: fewRows }), { status: 200 })),
      );
      await expect(fetchStockDirectory()).rejects.toThrow(/only 500 valid rows/);
      expect(countRows()).toBe(0);
    });
  });

  describe("applyStockDirectory", () => {
    it("upserts rows; codes missing from a new list get listed = 0 (row kept); a row with empty companyName never blanks an existing name", async () => {
      const { applyStockDirectory } = await import("../prices/directory");

      // Initial batch of stocks
      applyStockDirectory(
        [
          { code: "AAA", companyName: "Công ty An Phát", shortName: "An Phát", floor: "HOSE" },
          { code: "BBB", companyName: "Công ty Bình Minh", shortName: "Bình Minh", floor: "HNX" },
        ],
        "vndirect",
      );

      const rowsAfterFirst = fx.db
        .prepare("SELECT code, company_name, listed FROM gv2_stock_directory ORDER BY code")
        .all() as { code: string; company_name: string; listed: number }[];
      expect(rowsAfterFirst).toEqual([
        { code: "AAA", company_name: "Công ty An Phát", listed: 1 },
        { code: "BBB", company_name: "Công ty Bình Minh", listed: 1 },
      ]);

      // Second batch:
      // - BBB is updated with a new name
      // - AAA is missing from the list (should be marked listed = 0, row kept)
      // - CCC is newly added
      // - Empty companyName row ({ code: "BBB", companyName: "" }) is ignored by validRows, so it doesn't blank BBB
      applyStockDirectory(
        [
          { code: "BBB", companyName: "Bình Minh Mới", shortName: "BM", floor: "HNX" },
          { code: "CCC", companyName: "Công ty Cổ phần C", shortName: "C", floor: "UPCOM" },
          { code: "AAA", companyName: "   ", shortName: null, floor: null }, // empty companyName -> skipped
        ],
        "vndirect",
      );

      const rowsAfterSecond = fx.db
        .prepare("SELECT code, company_name, listed FROM gv2_stock_directory ORDER BY code")
        .all() as { code: string; company_name: string; listed: number }[];

      expect(rowsAfterSecond).toEqual([
        { code: "AAA", company_name: "Công ty An Phát", listed: 0 },
        { code: "BBB", company_name: "Bình Minh Mới", listed: 1 },
        { code: "CCC", company_name: "Công ty Cổ phần C", listed: 1 },
      ]);
    });
  });

  describe("ensureStockDirectory", () => {
    it("no fetch when the last vndirect sync is < 7 days old; fetches when older; snapshot-only is not fresh; after failed attempt does not retry for 1 hour unless force", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const now = new Date("2026-10-19T10:00:00.000Z");
      vi.setSystemTime(now);

      vi.resetModules();
      const dir = await import("../prices/directory");

      const validItems = Array.from({ length: 1005 }, (_, i) => ({
        code: `TC${i}`,
        companyName: `Company TC${i}`,
      }));

      let fetchCallCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          fetchCallCount++;
          return new Response(JSON.stringify({ data: validItems }), { status: 200 });
        }),
      );

      // Case 1: Snapshot-only table is not considered fresh -> must trigger fetch
      fx.db
        .prepare(
          "INSERT INTO gv2_stock_directory (code, company_name, listed, source, synced_at) VALUES ('S1', 'Snap 1', 1, 'snapshot', ?)",
        )
        .run(now.toISOString());

      fetchCallCount = 0;
      dir.ensureStockDirectory();
      expect(fetchCallCount).toBe(1);

      // Wait for background async completion
      await vi.waitFor(() => {
        const synced = fx.db
          .prepare("SELECT COUNT(*) AS c FROM gv2_stock_directory WHERE source = 'vndirect'")
          .get() as { c: number };
        expect(synced.c).toBeGreaterThan(0);
      });

      // Case 2: Last vndirect sync is fresh (< 7 days old) -> does NOT fetch
      fetchCallCount = 0;
      dir.ensureStockDirectory();
      expect(fetchCallCount).toBe(0);

      // Advance time by 3 days -> still < 7 days old -> no fetch
      vi.setSystemTime(new Date(now.getTime() + 3 * 24 * 3600_000));
      dir.ensureStockDirectory();
      expect(fetchCallCount).toBe(0);

      // Case 3: Last vndirect sync is older than 7 days (e.g. 8 days old) -> fetches
      vi.setSystemTime(new Date(now.getTime() + 8 * 24 * 3600_000));
      fetchCallCount = 0;
      dir.ensureStockDirectory();
      expect(fetchCallCount).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Case 4: After a failed attempt, does not retry for 1 hour unless force
      // Advance to 10 days, stub fetch to fail
      vi.setSystemTime(new Date(now.getTime() + 10 * 24 * 3600_000));
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          fetchCallCount++;
          throw new Error("Network drop during sync");
        }),
      );

      fetchCallCount = 0;
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      dir.ensureStockDirectory({ force: true });
      expect(fetchCallCount).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now call again 30 minutes later (within 1 hour) without force -> does not retry
      vi.setSystemTime(new Date(now.getTime() + 10 * 24 * 3600_000 + 30 * 60_000));
      fetchCallCount = 0;
      dir.ensureStockDirectory();
      expect(fetchCallCount).toBe(0);

      // But calling with force: true -> retries immediately
      dir.ensureStockDirectory({ force: true });
      expect(fetchCallCount).toBe(1);

      errorSpy.mockRestore();
    });
  });

  describe("Seed", () => {
    it("an empty table is filled from the snapshot file with source = 'snapshot'", async () => {
      vi.resetModules();
      const { seedStockDirectory } = await import("../prices/directory");

      expect(
        (fx.db.prepare("SELECT COUNT(*) AS c FROM gv2_stock_directory").get() as { c: number }).c,
      ).toBe(0);

      seedStockDirectory();

      const count = (
        fx.db.prepare("SELECT COUNT(*) AS c FROM gv2_stock_directory WHERE source = 'snapshot'").get() as {
          c: number;
        }
      ).c;
      expect(count).toBe(1005);
    });
  });

  describe("readMarketInstruments", () => {
    it("a stock's fullName comes from gv2_stock_directory (e.g. STB → 'Ngân hàng TMCP Sài Gòn Tài Lộc'), not from any hardcoded map", async () => {
      vi.resetModules();
      const { readMarketInstruments } = await import("../prices/repo");

      // Insert stock directory entry with custom company name
      fx.db
        .prepare(
          "INSERT INTO gv2_stock_directory (code, company_name, listed, source, synced_at) VALUES ('STB', 'Ngân hàng TMCP Sài Gòn Tài Lộc', 1, 'test', ?)",
        )
        .run(new Date().toISOString());

      // Insert stock instrument and a price point
      fx.db
        .prepare(
          "INSERT OR REPLACE INTO gv2_instruments (id, kind, name, unit, fractional, source, external_ref, active, listed) VALUES ('stock-stb', 'stock', 'STB', 'cổ phiếu', 0, 'vndirect', 'STB', 1, 1)",
        )
        .run();

      fx.db
        .prepare(
          "INSERT OR REPLACE INTO gv2_prices (instrument_id, price_date, price, raw_price, source, fetched_at) VALUES ('stock-stb', '2026-10-18', 35000, 35, 'test', ?)",
        )
        .run(new Date().toISOString());

      const instruments = readMarketInstruments();
      const stb = instruments.find((i) => i.id === "stock-stb");
      expect(stb).toBeDefined();
      expect(stb?.fullName).toBe("Ngân hàng TMCP Sài Gòn Tài Lộc");
    });
  });

  describe("registerStockSymbol", () => {
    it("for a code missing from the directory falls back to SSI (iboard-query.ssi.com.vn, data.companyNameVi) and stores it with source = 'ssi'", async () => {
      vi.resetModules();
      const { registerStockSymbol } = await import("../prices/sync");

      fx.db.prepare("DELETE FROM gv2_stock_directory WHERE code = 'VND'").run();
      fx.db.prepare("DELETE FROM gv2_instruments WHERE id = 'stock-vnd'").run();
      fx.db.prepare("DELETE FROM gv2_prices WHERE instrument_id = 'stock-vnd'").run();

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = String(url);
          if (urlStr.includes("dchart-api.vndirect.com.vn")) {
            return new Response(
              JSON.stringify({
                s: "ok",
                t: [1756688400, 1756774800],
                c: [15.5, 16.0],
              }),
              { status: 200 },
            );
          }
          if (urlStr.includes("iboard-query.ssi.com.vn")) {
            return new Response(
              JSON.stringify({
                data: {
                  companyNameVi: "CTCP Chứng khoán VNDIRECT",
                  exchange: "HOSE",
                },
              }),
              { status: 200 },
            );
          }
          return new Response("", { status: 404 });
        }),
      );

      const res = await registerStockSymbol("VND");
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.instrument.id).toBe("stock-vnd");
      expect(res.instrument.name).toBe("VND");
      expect(res.instrument.fullName).toBe("CTCP Chứng khoán VNDIRECT");

      const dirRow = fx.db
        .prepare("SELECT code, company_name, source, listed FROM gv2_stock_directory WHERE code = 'VND'")
        .get() as { code: string; company_name: string; source: string; listed: number };
      expect(dirRow).toBeDefined();
      expect(dirRow.source).toBe("ssi");
      expect(dirRow.company_name).toBe("CTCP Chứng khoán VNDIRECT");
      expect(dirRow.listed).toBe(1);
    });
  });
});
