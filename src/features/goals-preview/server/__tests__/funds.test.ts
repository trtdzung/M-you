// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

// Mock fund-directory snapshot with 32 valid funds
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (path: unknown, options: unknown) => {
      if (typeof path === "string" && path.includes("fund-directory.json")) {
        const items = Array.from({ length: 32 }, (_, i) => ({
          id: `fund-F${String(i).padStart(2, "0")}`,
          code: `F${String(i).padStart(2, "0")}`,
          label: `F${String(i).padStart(2, "0")}_LABEL`,
          fullName: `Quỹ Đầu Tư Thử Nghiệm F${i}`,
          productId: 1000 + i,
          nav: [{ date: "2026-10-18", price: 20000 + i * 100 }],
        }));
        return JSON.stringify({
          source: "fmarket",
          fetchedAt: "2026-10-18T10:00:00.000Z",
          items,
        });
      }
      return actual.readFileSync(path as any, options as any);
    },
  };
});

describe("Funds — fetchFunds, daily sync listing rules, fullName preservation, seed", () => {
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
  });

  describe("fetchFunds label & id mapping", () => {
    it("Label = Fmarket shortName when present (e.g. code VFMVF1, shortName DCDS → instrument id fund-VFMVF1, name DCDS), id stays fund-<code>", async () => {
      const { fetchFunds } = await import("../prices/sources");

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = String(url);
          if (urlStr.includes("products/filter")) {
            return new Response(
              JSON.stringify({
                data: {
                  rows: [
                    {
                      id: 101,
                      code: "VFMVF1",
                      shortName: "DCDS",
                      name: "Quỹ Đầu tư Doanh nghiệp Hàng đầu Việt Nam",
                    },
                    {
                      id: 102,
                      code: "SSIAMVNFIN",
                      shortName: null,
                      name: "Quỹ Đầu tư Cổ phiếu Tài chính SSI",
                    },
                  ],
                },
              }),
              { status: 200 },
            );
          }
          if (urlStr.includes("get-nav-history")) {
            const body = JSON.parse(String(init?.body ?? "{}"));
            const pid = body.productId;
            return new Response(
              JSON.stringify({
                data: [{ nav: pid === 101 ? 55000 : 22000, navDate: "2026-10-18" }],
              }),
              { status: 200 },
            );
          }
          return new Response("", { status: 404 });
        }),
      );

      const res = await fetchFunds(new Date("2026-10-19T10:00:00.000Z"), () => "2026-10-01");
      expect(res.errors).toEqual([]);
      expect(res.instruments).toHaveLength(2);

      const dcds = res.instruments.find((i) => i.id === "fund-VFMVF1");
      expect(dcds).toBeDefined();
      expect(dcds?.id).toBe("fund-VFMVF1");
      expect(dcds?.name).toBe("DCDS");
      expect(dcds?.fullName).toBe("Quỹ Đầu tư Doanh nghiệp Hàng đầu Việt Nam");

      const ssiam = res.instruments.find((i) => i.id === "fund-SSIAMVNFIN");
      expect(ssiam).toBeDefined();
      expect(ssiam?.id).toBe("fund-SSIAMVNFIN");
      expect(ssiam?.name).toBe("SSIAMVNFIN");
      expect(ssiam?.fullName).toBe("Quỹ Đầu tư Cổ phiếu Tài chính SSI");
    });
  });

  describe("Daily sync listing rules and readMarketInstruments", () => {
    it("sync with ≥ 30 funds marks missing funds listed = 0, keeps their NAV and active, returns them with listed: false; sync with < 30 or failed leaves listed unchanged; returning funds get listed = 1", async () => {
      vi.resetModules();
      const { refreshPricesNow } = await import("../prices/sync");
      const { readMarketInstruments } = await import("../prices/repo");

      // Setup initial fund in DB: fund-OLD
      fx.db.prepare("DELETE FROM gv2_prices WHERE instrument_id LIKE 'fund-%'").run();
      fx.db.prepare("DELETE FROM gv2_instruments WHERE kind = 'external_fund'").run();
      fx.db.prepare("DELETE FROM gv2_price_sync").run();

      fx.db
        .prepare(
          `INSERT INTO gv2_instruments (id, kind, name, full_name, unit, fractional, source, external_ref, active, listed)
           VALUES ('fund-OLD', 'external_fund', 'OLD', 'Quỹ Cũ Khách Giữ', 'CCQ', 1, 'fmarket', '999', 1, 1)`,
        )
        .run();
      fx.db
        .prepare(
          `INSERT INTO gv2_prices (instrument_id, price_date, price, raw_price, source, fetched_at)
           VALUES ('fund-OLD', '2026-10-17', 15000, 15000, 'fmarket', '2026-10-17T15:00:00Z')`,
        )
        .run();

      // Helper to generate 30 Fmarket mock funds (Fund00..Fund29)
      const makeFmarketRows = (count: number, includeOld = false) => {
        const rows = Array.from({ length: count }, (_, i) => ({
          id: 2000 + i,
          code: `F${String(i).padStart(2, "0")}`,
          shortName: `F${String(i).padStart(2, "0")}`,
          name: `Quỹ F${i}`,
        }));
        if (includeOld) {
          rows.push({
            id: 999,
            code: "OLD",
            shortName: "OLD",
            name: "Quỹ Cũ Khách Giữ",
          });
        }
        return rows;
      };

      // 1. Run sync with 30 funds (missing fund-OLD)
      let activeRows = makeFmarketRows(30, false);
      let filterFail = false;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = String(url);
          if (urlStr.includes("edge-api.pnj.io") || urlStr.includes("api.btmc.vn")) {
            return new Response(JSON.stringify({ data: [{ masp: "SJC", giamua: "85.0" }] }));
          }
          if (urlStr.includes("dchart-api.vndirect.com.vn")) {
            return new Response(JSON.stringify({ s: "ok", t: [], c: [] }));
          }
          if (urlStr.includes("products/filter")) {
            if (filterFail) throw new Error("Fmarket filter failed");
            return new Response(JSON.stringify({ data: { rows: activeRows } }));
          }
          if (urlStr.includes("get-nav-history")) {
            return new Response(JSON.stringify({ data: [{ nav: 20000, navDate: "2026-10-18" }] }));
          }
          return new Response("", { status: 404 });
        }),
      );

      refreshPricesNow();

      // Wait for sync to finish
      await vi.waitFor(() => {
        const row = fx.db.prepare("SELECT status FROM gv2_price_sync ORDER BY id DESC LIMIT 1").get() as {
          status: string;
        } | undefined;
        expect(row?.status).toMatch(/ok|partial/);
      });

      // Check fund-OLD in DB: listed = 0, active = 1, NAV kept
      const oldRow = fx.db
        .prepare("SELECT listed, active FROM gv2_instruments WHERE id = 'fund-OLD'")
        .get() as { listed: number; active: number };
      expect(oldRow.listed).toBe(0);
      expect(oldRow.active).toBe(1);

      const navRows = fx.db
        .prepare("SELECT price FROM gv2_prices WHERE instrument_id = 'fund-OLD'")
        .all() as { price: number }[];
      expect(navRows).toHaveLength(1);
      expect(navRows[0].price).toBe(15000);

      // readMarketInstruments returns it with listed: false
      const instruments = readMarketInstruments();
      const oldInst = instruments.find((i) => i.id === "fund-OLD");
      expect(oldInst).toBeDefined();
      expect(oldInst?.listed).toBe(false);

      // 2. Next sync has < 30 funds (e.g. 10 funds): listed must remain unchanged
      fx.db.prepare("DELETE FROM gv2_price_sync").run();
      activeRows = makeFmarketRows(10, false);

      refreshPricesNow();
      await vi.waitFor(() => {
        const row = fx.db.prepare("SELECT status FROM gv2_price_sync ORDER BY id DESC LIMIT 1").get() as {
          status: string;
        } | undefined;
        expect(row?.status).toMatch(/ok|partial/);
      });

      const oldRowAfterSmall = fx.db
        .prepare("SELECT listed FROM gv2_instruments WHERE id = 'fund-OLD'")
        .get() as { listed: number };
      expect(oldRowAfterSmall.listed).toBe(0);

      // 3. Failed list call: listed must remain unchanged
      fx.db.prepare("DELETE FROM gv2_price_sync").run();
      filterFail = true;

      refreshPricesNow();
      await vi.waitFor(() => {
        const row = fx.db.prepare("SELECT status FROM gv2_price_sync ORDER BY id DESC LIMIT 1").get() as {
          status: string;
        } | undefined;
        expect(row?.status).toBe("failed");
      });

      const oldRowAfterFail = fx.db
        .prepare("SELECT listed FROM gv2_instruments WHERE id = 'fund-OLD'")
        .get() as { listed: number };
      expect(oldRowAfterFail.listed).toBe(0);

      // 4. Fund returns to the list with ≥ 30 funds: listed = 1
      filterFail = false;
      activeRows = makeFmarketRows(30, true); // includes OLD
      fx.db.prepare("DELETE FROM gv2_price_sync").run();

      refreshPricesNow();
      await vi.waitFor(() => {
        const row = fx.db.prepare("SELECT status FROM gv2_price_sync ORDER BY id DESC LIMIT 1").get() as {
          status: string;
        } | undefined;
        expect(row?.status).toMatch(/ok|partial/);
      });

      const oldRowReturned = fx.db
        .prepare("SELECT listed FROM gv2_instruments WHERE id = 'fund-OLD'")
        .get() as { listed: number };
      expect(oldRowReturned.listed).toBe(1);

      const instrumentsReturned = readMarketInstruments();
      const oldInstReturned = instrumentsReturned.find((i) => i.id === "fund-OLD");
      expect(oldInstReturned?.listed).not.toBe(false);
    });
  });

  describe("fullName preservation", () => {
    it("a sync never overwrites an existing full_name with null", async () => {
      vi.resetModules();
      const { refreshPricesNow } = await import("../prices/sync");

      fx.db.prepare("DELETE FROM gv2_instruments WHERE id = 'fund-FN'").run();
      fx.db.prepare("DELETE FROM gv2_prices WHERE instrument_id = 'fund-FN'").run();
      fx.db.prepare("DELETE FROM gv2_price_sync").run();

      // Insert fund with an existing rich full_name
      fx.db
        .prepare(
          `INSERT INTO gv2_instruments (id, kind, name, full_name, unit, fractional, source, external_ref, active, listed)
           VALUES ('fund-FN', 'external_fund', 'FN', 'Quỹ Cổ Phiếu Tăng Trưởng Toàn Diện', 'CCQ', 1, 'fmarket', '555', 1, 1)`,
        )
        .run();

      // Fmarket returns row where name == shortName -> fetchFunds produces fullName: undefined (null in upsert)
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = String(url);
          if (urlStr.includes("edge-api.pnj.io") || urlStr.includes("api.btmc.vn")) {
            return new Response(JSON.stringify({ data: [{ masp: "SJC", giamua: "85.0" }] }));
          }
          if (urlStr.includes("dchart-api.vndirect.com.vn")) {
            return new Response(JSON.stringify({ s: "ok", t: [], c: [] }));
          }
          if (urlStr.includes("products/filter")) {
            return new Response(
              JSON.stringify({
                data: {
                  rows: [{ id: 555, code: "FN", shortName: "FN", name: "FN" }],
                },
              }),
            );
          }
          if (urlStr.includes("get-nav-history")) {
            return new Response(JSON.stringify({ data: [{ nav: 30000, navDate: "2026-10-18" }] }));
          }
          return new Response("", { status: 404 });
        }),
      );

      refreshPricesNow();
      await vi.waitFor(() => {
        const row = fx.db.prepare("SELECT status FROM gv2_price_sync ORDER BY id DESC LIMIT 1").get() as {
          status: string;
        } | undefined;
        expect(row?.status).toMatch(/ok|partial/);
      });

      const row = fx.db
        .prepare("SELECT full_name FROM gv2_instruments WHERE id = 'fund-FN'")
        .get() as { full_name: string | null };
      expect(row.full_name).toBe("Quỹ Cổ Phiếu Tăng Trưởng Toàn Diện");
    });
  });

  describe("Seed fund directory", () => {
    it("with no external_fund rows, funds + NAV are inserted from the fund snapshot; with existing funds nothing is seeded", async () => {
      vi.resetModules();
      const { seedFundDirectory } = await import("../prices/fund-directory");

      // Case 1: with existing funds -> nothing seeded
      fx.db.prepare("DELETE FROM gv2_instruments WHERE kind = 'external_fund'").run();
      fx.db.prepare("DELETE FROM gv2_prices WHERE instrument_id LIKE 'fund-%'").run();

      fx.db
        .prepare(
          `INSERT INTO gv2_instruments (id, kind, name, full_name, unit, fractional, source, external_ref, active, listed)
           VALUES ('fund-EXIST', 'external_fund', 'EXIST', 'Quỹ Đã Có', 'CCQ', 1, 'manual', '1', 1, 1)`,
        )
        .run();

      seedFundDirectory();

      const countWithExisting = (
        fx.db.prepare("SELECT COUNT(*) AS c FROM gv2_instruments WHERE kind = 'external_fund'").get() as {
          c: number;
        }
      ).c;
      expect(countWithExisting).toBe(1);

      // Case 2: with no external_fund rows -> seeded from snapshot
      fx.db.prepare("DELETE FROM gv2_instruments WHERE kind = 'external_fund'").run();
      fx.db.prepare("DELETE FROM gv2_prices WHERE instrument_id LIKE 'fund-%'").run();

      vi.resetModules();
      const freshSeedModule = await import("../prices/fund-directory");
      freshSeedModule.seedFundDirectory();

      const countAfterSeed = (
        fx.db.prepare("SELECT COUNT(*) AS c FROM gv2_instruments WHERE kind = 'external_fund'").get() as {
          c: number;
        }
      ).c;
      expect(countAfterSeed).toBe(32);

      // Check name = snapshot label, NAV source = 'snapshot'
      const sample = fx.db
        .prepare("SELECT name, full_name FROM gv2_instruments WHERE id = 'fund-F00'")
        .get() as { name: string; full_name: string };
      expect(sample.name).toBe("F00_LABEL");
      expect(sample.full_name).toBe("Quỹ Đầu Tư Thử Nghiệm F0");

      const navSample = fx.db
        .prepare("SELECT source, price FROM gv2_prices WHERE instrument_id = 'fund-F00'")
        .get() as { source: string; price: number };
      expect(navSample.source).toBe("snapshot");
      expect(navSample.price).toBe(20000);
    });
  });
});
