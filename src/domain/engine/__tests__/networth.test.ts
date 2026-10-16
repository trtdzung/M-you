import { describe, expect, it } from "vitest";
import type { Asset, Liability } from "@/domain/models";
import { calculateNetWorth } from "../networth";

function asset(over: Partial<Asset>): Asset {
  return { id: "a", type: "fund", name: "Quỹ", value: 0, currency: "VND", source: "self_reported", lastUpdatedAt: "2026-09-01T00:00:00.000Z", isEstimated: false, ...over };
}
function liability(over: Partial<Liability>): Liability {
  return { id: "l", type: "personal_loan", name: "Vay", outstandingPrincipal: 0, interestRate: 0.1, minimumPayment: 1_000_000, dueDate: null, remainingTerm: 12, source: "self_reported", lastUpdatedAt: "2026-09-01T00:00:00.000Z", ...over };
}

describe("calculateNetWorth", () => {
  it("computes assets minus liabilities", () => {
    const r = calculateNetWorth(
      [asset({ id: "a1", value: 100_000_000 }), asset({ id: "a2", value: 50_000_000 })],
      [liability({ id: "l1", outstandingPrincipal: 40_000_000 })],
    );
    expect(r.assetsTotal).toBe(150_000_000);
    expect(r.liabilitiesTotal).toBe(40_000_000);
    expect(r.total).toBe(110_000_000);
  });

  it("keeps unknown asset values unknown (never silent 0)", () => {
    const r = calculateNetWorth(
      [asset({ id: "a1", value: 100_000_000 }), asset({ id: "a2", name: "Căn hộ", value: null })],
      [],
    );
    expect(r.assetsTotal).toBe(100_000_000);
    expect(r.unknownFields).toEqual(["Căn hộ"]);
    expect(r.hasUnknown).toBe(true);
    expect(r.meta.sourceCoverage.unknownCount).toBe(1);
  });

  it("builds a per-item breakdown tagged asset/liability", () => {
    const r = calculateNetWorth(
      [asset({ id: "a1", type: "gold", name: "Vàng", value: 15_000_000 })],
      [liability({ id: "l1", name: "Thẻ", outstandingPrincipal: 8_000_000 })],
    );
    expect(r.breakdown).toContainEqual(expect.objectContaining({ id: "a1", kind: "asset", amount: 15_000_000 }));
    expect(r.breakdown).toContainEqual(expect.objectContaining({ id: "l1", kind: "liability", amount: 8_000_000 }));
  });

  it("reports freshness as the most recent lastUpdatedAt", () => {
    const r = calculateNetWorth(
      [asset({ id: "a1", value: 1, lastUpdatedAt: "2026-08-01T00:00:00.000Z" }), asset({ id: "a2", value: 1, lastUpdatedAt: "2026-09-10T00:00:00.000Z" })],
      [],
    );
    expect(r.meta.freshness).toBe("2026-09-10T00:00:00.000Z");
  });
});
