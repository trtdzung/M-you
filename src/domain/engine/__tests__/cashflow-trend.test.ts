import { describe, expect, it } from "vitest";
import { cashflowTrend } from "../cashflow-trend";
import { txn } from "./helpers";

describe("cashflowTrend", () => {
  const txns = [
    txn({ postedAt: "2026-08-10T10:00:00.000Z", amount: 5_000_000, direction: "debit", type: "expense", categoryId: "dining" }),
    txn({ postedAt: "2026-09-12T10:00:00.000Z", amount: 6_000_000, direction: "debit", type: "expense", categoryId: "dining" }),
  ];

  it("returns one chronological point per month in the window", () => {
    const t = cashflowTrend(txns, "2026-09", 6);
    expect(t.points).toHaveLength(6);
    expect(t.points.map((p) => p.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("[H3] flags months that predate any data as hasData:false (gap, not 0 bar)", () => {
    const t = cashflowTrend(txns, "2026-09", 6);
    const byMonth = Object.fromEntries(t.points.map((p) => [p.month, p]));
    // No transactions before August → no data.
    expect(byMonth["2026-06"].hasData).toBe(false);
    expect(byMonth["2026-06"].expense).toBe(0);
    // Months with transactions → real data.
    expect(byMonth["2026-08"].hasData).toBe(true);
    expect(byMonth["2026-08"].expense).toBe(5_000_000);
    expect(byMonth["2026-09"].hasData).toBe(true);
  });

  it("distinguishes a genuine-zero month from a no-data month", () => {
    // A month with only a reversed txn nets 0 expense but still has posted-record
    // data — use a reversed-only month: expense genuinely 0, but hasData false
    // because there is no POSTED record (reversed is excluded from `latest`).
    // Use a refund-only month instead: expense can go negative-net-0-ish but the
    // record IS posted, so hasData is true.
    const refundOnly = [
      txn({ id: "buy", postedAt: "2026-07-05T10:00:00.000Z", amount: 400_000, direction: "debit", type: "expense", categoryId: "shopping" }),
      txn({ id: "ref", postedAt: "2026-07-06T10:00:00.000Z", amount: 400_000, direction: "credit", type: "refund", categoryId: "shopping", relatedTransactionId: "buy" }),
    ];
    const t = cashflowTrend(refundOnly, "2026-07", 2);
    const jul = t.points.find((p) => p.month === "2026-07")!;
    expect(jul.hasData).toBe(true);
    expect(jul.expense).toBe(0); // genuine zero, not a gap
    const jun = t.points.find((p) => p.month === "2026-06")!;
    expect(jun.hasData).toBe(false);
  });

  it("reports the freshest record with data in meta", () => {
    const t = cashflowTrend(txns, "2026-09", 6);
    expect(t.meta.freshness).toBe("2026-09-12T10:00:00.000Z");
  });

  it("empty transactions → all points hasData:false, null freshness", () => {
    const t = cashflowTrend([], "2026-09", 3);
    expect(t.points.every((p) => !p.hasData)).toBe(true);
    expect(t.meta.freshness).toBeNull();
  });
});
