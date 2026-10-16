import { describe, expect, it } from "vitest";
import { getProviders } from "@/providers";
import { generateDataset } from "../fixtures/generate";
import { PERSONAS } from "../personas";

describe("mock fixtures", () => {
  it("generates deterministic data for the same persona", () => {
    const a = generateDataset(PERSONAS.stable);
    const b = generateDataset(PERSONAS.stable);
    expect(a.transactions).toEqual(b.transactions);
  });

  it("produces different data across personas", () => {
    const stable = generateDataset(PERSONAS.stable);
    const wealthy = generateDataset(PERSONAS.wealthy);
    expect(stable.transactions.length).not.toBe(0);
    expect(stable.transactions).not.toEqual(wealthy.transactions);
  });

  it("tags every record as mock and spans ~6 months", () => {
    const ds = generateDataset(PERSONAS.stable);
    expect(ds.transactions.every((t) => t.source === "mock")).toBe(true);
    const months = new Set(ds.transactions.map((t) => t.postedAt.slice(0, 7)));
    expect(months.size).toBe(6);
  });

  it("includes transfers, refunds, reversals and pending items", () => {
    const ds = generateDataset(PERSONAS.stable);
    expect(ds.transactions.some((t) => t.type === "transfer")).toBe(true);
    expect(ds.transactions.some((t) => t.type === "refund")).toBe(true);
    expect(ds.transactions.some((t) => t.status === "reversed")).toBe(true);
    expect(ds.transactions.some((t) => t.status === "pending")).toBe(true);
  });

  it("gives the wealthy persona an unknown-valued asset", () => {
    const ds = generateDataset(PERSONAS.wealthy);
    expect(ds.assets.some((a) => a.value === null)).toBe(true);
  });

  it("gives every account a masked number and mock-safe display fields", () => {
    const ds = generateDataset(PERSONAS.stable);
    expect(ds.accounts.every((a) => /^•••• \d{4}$/.test(a.maskedNumber))).toBe(true);
    expect(ds.accounts.every((a) => a.source === "msb")).toBe(true);
    // Only the primary current account carries a tier.
    const current = ds.accounts.find((a) => a.type === "current");
    expect(current?.tier).toBe(PERSONAS.stable.tier);
    expect(ds.accounts.filter((a) => a.tier).length).toBe(1);
  });
});

describe("provider factory", () => {
  it("filters transactions by query and memoizes per persona", async () => {
    const providers = getProviders("stable");
    expect(getProviders("stable")).toBe(providers); // memoized

    const all = await providers.listTransactions();
    expect(all.length).toBeGreaterThan(0);

    const junePosted = await providers.listTransactions({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T23:59:59.000Z",
      status: "posted",
    });
    expect(junePosted.every((t) => t.status === "posted" && t.postedAt.slice(0, 7) === "2026-06")).toBe(true);
  });

  it("exposes accounts, assets, liabilities, budgets, snapshots, goals, products", async () => {
    const p = getProviders("wealthy");
    expect((await p.listAccounts()).length).toBe(3);
    expect((await p.listAssets()).length).toBeGreaterThan(0);
    expect((await p.listLiabilities()).length).toBeGreaterThan(0);
    expect((await p.getBudgets()).length).toBeGreaterThan(0);
    expect((await p.getMonthlySnapshots()).length).toBe(6);
    expect((await p.listGoals()).length).toBeGreaterThan(0);
    expect((await p.listMockProducts()).length).toBeGreaterThan(0);
  });
});
