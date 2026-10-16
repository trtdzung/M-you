import { describe, expect, it } from "vitest";
import { getProviders } from "@/providers";
import { aggregateCashflow, calculateNetWorth, monthPeriodFromKey } from "..";

/** End-to-end sanity: provider fixtures flow through the engine correctly. */
describe("engine + fixtures integration", () => {
  it("computes a sensible June cash flow for the stable persona", async () => {
    const p = getProviders("stable");
    const txns = await p.listTransactions();
    const cf = aggregateCashflow(txns, monthPeriodFromKey("2026-06"));

    expect(cf.income).toBeGreaterThan(0);
    expect(cf.expense).toBeGreaterThan(0);
    // Internal transfers (2,000,000 each month) must not appear as expense.
    expect(cf.byCategory.some((c) => c.categoryId === "transfer")).toBe(false);
    expect(cf.fixed + cf.discretionary).toBe(cf.expense);
  });

  it("computes net worth with unknown coverage for the wealthy persona", async () => {
    const p = getProviders("wealthy");
    const [assets, liabilities] = await Promise.all([p.listAssets(), p.listLiabilities()]);
    const nw = calculateNetWorth(assets, liabilities);

    expect(nw.hasUnknown).toBe(true); // real-estate value is unknown
    expect(nw.assetsTotal).toBeGreaterThan(0);
    expect(nw.total).toBe(nw.assetsTotal - nw.liabilitiesTotal);
  });
});
