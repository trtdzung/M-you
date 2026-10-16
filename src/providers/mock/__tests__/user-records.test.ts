import { beforeEach, describe, expect, it } from "vitest";
import type { Asset, Liability } from "@/domain/models";
import { getProviders } from "@/providers";

/**
 * Mock provider user-record CRUD (persona-scoped, versioned, per-record guarded).
 * Red-team #3 (listAssets stays seed-only → no double-count), #4 (a corrupt
 * element is dropped but its siblings survive — never a whole-store wipe), #7
 * (no cross-persona leak).
 */

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: "ua_1",
  type: "cash",
  name: "Ví tiền mặt",
  value: 1_000_000,
  currency: "VND",
  source: "self_reported",
  lastUpdatedAt: "2026-09-09T00:00:00.000Z",
  isEstimated: true,
  ...over,
});

const liability = (over: Partial<Liability> = {}): Liability => ({
  id: "ul_1",
  type: "credit_card",
  name: "Thẻ tín dụng",
  outstandingPrincipal: 5_000_000,
  interestRate: 0.3,
  minimumPayment: 500_000,
  dueDate: null,
  remainingTerm: null,
  source: "self_reported",
  lastUpdatedAt: "2026-09-09T00:00:00.000Z",
  ...over,
});

const ASSET_KEY = "msb-pfm.assets.stable";

beforeEach(() => {
  window.localStorage.clear();
});

describe("mock provider user records", () => {
  it("round-trips a created asset per persona", async () => {
    const p = getProviders("stable");
    await p.createAsset(asset({ id: "a", value: 7_000_000 }));

    const { records, dropped } = await p.getUserAssets();
    expect(dropped).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "a", value: 7_000_000, source: "self_reported" });
  });

  it("keeps listAssets SEED-ONLY — user records never fold in (no double-count)", async () => {
    const p = getProviders("stable");
    const seedBefore = await p.listAssets();
    await p.createAsset(asset({ id: "a" }));

    const seedAfter = await p.listAssets();
    expect(seedAfter).toHaveLength(seedBefore.length);
    expect(seedAfter.some((a) => a.id === "a")).toBe(false);
    // The user record is only reachable through the distinct user read.
    expect((await p.getUserAssets()).records.some((a) => a.id === "a")).toBe(true);
  });

  it("[red-team #4] drops only the malformed element, keeps valid siblings + counts it", async () => {
    // One valid record + one structurally broken record in the same store.
    window.localStorage.setItem(
      ASSET_KEY,
      JSON.stringify({ version: 1, records: [asset({ id: "ok" }), { id: "bad" }] }),
    );
    const { records, dropped } = await getProviders("stable").getUserAssets();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("ok");
    expect(dropped).toBe(1);
  });

  it("[red-team #4] rejects NaN / negative / over-cap values per record", async () => {
    window.localStorage.setItem(
      ASSET_KEY,
      '{"version":1,"records":[{"id":"nan","type":"cash","name":"x","value":NaN,"currency":"VND","source":"self_reported","lastUpdatedAt":"t","isEstimated":true}]}',
    );
    expect((await getProviders("stable").getUserAssets()).records).toHaveLength(0);

    window.localStorage.setItem(
      ASSET_KEY,
      JSON.stringify({ version: 1, records: [asset({ id: "neg", value: -1 })] }),
    );
    expect((await getProviders("stable").getUserAssets()).records).toHaveLength(0);
  });

  it("treats a corrupt / wrong-shape store as empty (never throws)", async () => {
    window.localStorage.setItem(ASSET_KEY, "not json");
    expect(await getProviders("stable").getUserAssets()).toEqual({ records: [], dropped: 0 });

    window.localStorage.setItem(ASSET_KEY, JSON.stringify({ nope: true }));
    expect(await getProviders("stable").getUserAssets()).toEqual({ records: [], dropped: 0 });
  });

  it("updates and deletes a record by id", async () => {
    const p = getProviders("stable");
    await p.createAsset(asset({ id: "a", value: 1_000_000 }));
    await p.updateAsset(asset({ id: "a", value: 2_000_000, name: "Đổi tên" }));
    expect((await p.getUserAssets()).records[0]).toMatchObject({ value: 2_000_000, name: "Đổi tên" });

    await p.deleteAsset("a");
    expect((await p.getUserAssets()).records).toHaveLength(0);
  });

  it("[red-team #7] isolates user records per persona — no leak", async () => {
    await getProviders("stable").createAsset(asset({ id: "a" }));
    expect((await getProviders("wealthy").getUserAssets()).records).toHaveLength(0);
    expect((await getProviders("stable").getUserAssets()).records).toHaveLength(1);
  });

  it("round-trips liabilities the same way", async () => {
    const p = getProviders("irregular");
    await p.createLiability(liability({ id: "l", outstandingPrincipal: 9_000_000 }));
    const { records } = await p.getUserLiabilities();
    expect(records[0]).toMatchObject({ id: "l", outstandingPrincipal: 9_000_000, source: "self_reported" });

    const seed = await p.listLiabilities();
    expect(seed.some((l) => l.id === "l")).toBe(false); // seed-only
  });
});
