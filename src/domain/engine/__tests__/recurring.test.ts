import { describe, expect, it } from "vitest";
import type { Liability } from "@/domain/models";
import { detectRecurring } from "../recurring";
import { upcomingObligations } from "../obligations";
import { txn } from "./helpers";

function monthly(merchant: string, category: string, amount: number, day: number, months: number[]) {
  return months.map((m) =>
    txn({
      merchantName: merchant,
      merchantNormalizedName: merchant.toLowerCase(),
      categoryId: category,
      amount,
      postedAt: `2026-0${m}-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    }),
  );
}

describe("detectRecurring", () => {
  it("flags series present in >= 3 distinct months", () => {
    const series = detectRecurring([
      ...monthly("Netflix", "subscriptions", 260_000, 15, [4, 5, 6]),
      txn({ merchantName: "Random", merchantNormalizedName: "random", amount: 50_000, postedAt: "2026-06-01T10:00:00.000Z" }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].merchantNormalizedName).toBe("netflix");
    expect(series[0].distinctMonths).toBe(3);
    expect(series[0].averageAmount).toBe(260_000);
    expect(series[0].averageDayOfMonth).toBe(15);
  });

  it("does not flag one-off or two-month spend", () => {
    const series = detectRecurring(monthly("Grab", "transport", 90_000, 3, [5, 6]));
    expect(series).toHaveLength(0);
  });

  it("ignores transfers", () => {
    const series = detectRecurring(
      monthly("Chuyen tiet kiem", "transfer", 2_000_000, 6, [4, 5, 6]).map((t) => ({ ...t, type: "transfer" as const })),
    );
    expect(series).toHaveLength(0);
  });
});

describe("upcomingObligations", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");

  it("includes liabilities due within the horizon", () => {
    const liabilities: Liability[] = [
      { id: "l1", type: "credit_card", name: "Thẻ", outstandingPrincipal: 10_000_000, interestRate: 0.3, minimumPayment: 1_000_000, dueDate: "2026-09-20T00:00:00.000Z", remainingTerm: null, source: "msb", lastUpdatedAt: now.toISOString() },
      { id: "l2", type: "mortgage", name: "Nhà", outstandingPrincipal: 1_000_000_000, interestRate: 0.09, minimumPayment: 20_000_000, dueDate: "2026-12-01T00:00:00.000Z", remainingTerm: 100, source: "msb", lastUpdatedAt: now.toISOString() },
    ];
    const obs = upcomingObligations([], liabilities, { now, horizonDays: 30 });
    expect(obs).toHaveLength(1);
    expect(obs[0].id).toBe("l1");
    expect(obs[0].amount).toBe(1_000_000);
  });

  it("keeps an unknown minimum payment unknown", () => {
    const liabilities: Liability[] = [
      { id: "l1", type: "other", name: "Nợ", outstandingPrincipal: null, interestRate: null, minimumPayment: null, dueDate: "2026-09-18T00:00:00.000Z", remainingTerm: null, source: "self_reported", lastUpdatedAt: now.toISOString() },
    ];
    const obs = upcomingObligations([], liabilities, { now, horizonDays: 30 });
    expect(obs[0].amount).toBe("unknown");
  });

  it("predicts the next occurrence of a recurring bill", () => {
    const series = detectRecurring(monthly("EVN", "utilities", 900_000, 25, [7, 8, 9]));
    const obs = upcomingObligations(series, [], { now, horizonDays: 30 });
    expect(obs).toHaveLength(1);
    expect(obs[0].kind).toBe("recurring");
    expect(obs[0].dueDate.slice(0, 10)).toBe("2026-09-25");
  });
});
