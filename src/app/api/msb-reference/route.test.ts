// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as promotions } from "./promotions/route";
import { GET as channels } from "./official-channels/route";
import { GET as fraud } from "./fraud-watchlist/route";

const req = (path: string) => new NextRequest(`http://local/api/msb-reference/${path}`);

describe("GET /api/msb-reference/promotions", () => {
  it("lists promotions with provenance and a computed status", async () => {
    const body = await (await promotions(req("promotions"))).json();
    expect(body.source).toBe("mock");
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty("status");
  });
  it("filters and rejects an invalid status", async () => {
    const hit = await (await promotions(req("promotions?q=hoan%20tien&status=active"))).json();
    expect(hit.items.length).toBeGreaterThan(0);
    expect((await promotions(req("promotions?status=bogus"))).status).toBe(422);
  });
});

describe("GET /api/msb-reference/official-channels", () => {
  it("lists channels, optionally by type", async () => {
    const all = await (await channels(req("official-channels"))).json();
    const hot = await (await channels(req("official-channels?type=hotline"))).json();
    expect(all.items.length).toBeGreaterThan(hot.items.length);
    expect(hot.items.every((c: { type: string }) => c.type === "hotline")).toBe(true);
    expect((await channels(req("official-channels?type=bogus"))).status).toBe(422);
  });
  it("checks one value", async () => {
    const yes = await (await channels(req("official-channels?value=https%3A%2F%2Fmsb.com.vn%2Fx"))).json();
    const no = await (await channels(req("official-channels?value=msb-hoantien.com"))).json();
    expect(yes.official).toBe(true);
    expect(no.official).toBe(false);
  });
});

describe("GET /api/msb-reference/fraud-watchlist", () => {
  it("lists entries or checks a value", async () => {
    const all = await (await fraud(req("fraud-watchlist"))).json();
    expect(all.items.length).toBeGreaterThan(0);
    const hit = await (await fraud(req("fraud-watchlist?value=0900000001"))).json();
    expect(hit.found).toBe(true);
    const miss = await (await fraud(req("fraud-watchlist?value=0912345678"))).json();
    expect(miss.found).toBe(false);
    expect(miss.note).toMatch(/không đồng nghĩa/);
  });
});
