// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { CIF, openGoalFixtureDb, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { buildCustomerProfile } from "../customer-context";

process.env.AGENT_MODE = "mock";

describe("F10 customer-context", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  it("monthlySurplus = unknown khi kỳ 3 tháng thiếu thu/chi; dataMonths theo toàn lịch sử (D27)", () => {
    // Tương lai xa: cửa sổ 3 tháng trước không còn thu/chi thật → surplus unknown.
    const far = buildCustomerProfile(CIF, "2030-06-15", "conservative");
    expect(far.monthlySurplus).toBe("unknown");
    expect(far.dataMonths).toBeGreaterThanOrEqual(0);
    expect(typeof far.monthlyIncome).toBe("number");
    expect(typeof far.monthlyExpenses).toBe("number");

    // Chỉ chèn chuyển khoản trong kỳ gần → vẫn unknown (không tính transfer).
    const main = fx.db
      .prepare("SELECT id FROM accounts WHERE cif = ? AND type = 'current' LIMIT 1")
      .get(CIF) as { id: string };
    for (let m = 3; m <= 5; m++) {
      const id = `f10-transfer-only-${m}`;
      const postedAt = `2030-0${m}-05T02:00:00.000Z`;
      const t = {
        id,
        accountId: main.id,
        postedAt,
        amount: 500,
        currency: "VND",
        direction: "credit",
        type: "transfer",
        status: "posted",
        source: "mock",
        categoryId: "transfer",
      };
      fx.db
        .prepare("INSERT OR REPLACE INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
        .run(CIF, id, postedAt, JSON.stringify(t));
    }
    const transferOnly = buildCustomerProfile(CIF, "2030-06-15", "conservative");
    expect(transferOnly.monthlySurplus).toBe("unknown");
    expect(transferOnly.dataMonths).toBeGreaterThanOrEqual(far.dataMonths);
  });

  it("hôm nay trong giai đoạn có đủ dữ liệu seed → surplus là số", () => {
    const p = buildCustomerProfile(CIF, "2026-10-17", "conservative");
    expect(p.dataMonths).toBeGreaterThanOrEqual(3);
    expect(typeof p.monthlySurplus).toBe("number");
  });
});
