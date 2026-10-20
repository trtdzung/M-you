// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const world = {
  world: {
    goals: [{ id: "goal-1", name: "Mua xe", status: "accumulating", priority: 1, secret: "x" }],
    assets: [
      { id: "asset-1", goalId: "goal-1", name: "Xe máy", status: "held", value: 5 },
      { id: "asset-2", goalId: "goal-1", name: "Đã bán", status: "sold", value: 9 },
    ],
  },
  market: { instruments: new Array(100).fill({ id: "x" }) },
};
vi.mock("@/features/goals-preview/server/goal-service", () => ({ getWorld: vi.fn(() => world) }));

import { GET } from "../route";

const call = (qs: string) => GET(new NextRequest(`http://test/api/goals-v2?${qs}`));

describe("GET /api/goals-v2?scope=names", () => {
  it("returns only goal and asset names (no market, no sold assets, no other fields)", async () => {
    const res = await call("cif=CIF_1&scope=names");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      goals: [{ id: "goal-1", name: "Mua xe", status: "accumulating" }],
      assets: [{ id: "asset-1", goalId: "goal-1", name: "Xe máy" }],
    });
  });

  it("without scope it still returns the whole world", async () => {
    const body = await (await call("cif=CIF_1")).json();
    expect(body.market.instruments).toHaveLength(100);
  });

  it("needs a cif", async () => {
    expect((await call("scope=names")).status).toBe(422);
  });
});
