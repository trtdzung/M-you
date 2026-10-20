import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stateFromScenario } from "../../../../store/reducer";
import type { GoalRoadmap } from "../../../../model/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} }), usePathname: () => "/goals", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/providers/context", () => ({ usePersonaCif: () => "CIF_0001" }));
vi.mock("@/components/shell/PanelActive", () => ({ usePanelActive: () => true }));

import { PreviewStoreProvider, usePreview } from "../../../../store/PreviewStore";
import { ScreenHost } from "../../../ScreenHost";

const box = vi.hoisted(() => ({ ctx: null as any }));
function Probe() {
  box.ctx = usePreview();
  return null;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openOverview(roadmap?: GoalRoadmap) {
  const base = stateFromScenario("s01-car-feasible");
  const goals = base.goals.map((g, i) => (i === 0 && roadmap ? { ...g, roadmap } : g));
  const world = { ...base, goals, customer: { ...base.customer, cif: "CIF_0001" } };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ world, market: { instruments: [], refreshing: false, asOf: null } }))));
  render(<PreviewStoreProvider><Probe /><ScreenHost /></PreviewStoreProvider>);
  await waitFor(() => expect(box.ctx?.loadStatus).toBe("ready"));
  const today: string = box.ctx.state.clock.today;
  await act(async () => { box.ctx.nav.push("GoalDetail", { goalId: box.ctx.state.goals[0].id, tab: "overview" }); });
  return { today };
}

const roadmap = (today: string): GoalRoadmap => ({
  planId: "optimized",
  planName: "Kết hợp tối ưu",
  chosenAt: "2026-03-05",
  milestones: [
    { date: "2000-01-10", kind: "reserve", title: "Giữ quỹ dự phòng", detail: "Cần 45 triệu" },
    { date: "2000-02-01", endDate: "2000-12-01", kind: "save", title: "Tiết kiệm đều", action: "Bật trích tự động" },
    { date: "2999-05-20", kind: "buy", title: "Mua mục tiêu" },
  ],
});

describe("OverviewTab: mục Lộ trình", () => {
  it("không có roadmap: giữ lộ trình tự tính", async () => {
    await openOverview();
    const section = screen.getByRole("region", { name: "Lộ trình" });
    expect(within(section).getByText("Tạo mục tiêu")).toBeTruthy();
    expect(within(section).queryByText(/Theo phương án/)).toBeNull();
  });

  it("có roadmap: hiện lộ trình đã chọn thay cho lộ trình tự tính", async () => {
    const { today } = await openOverview(roadmap("x"));
    const section = screen.getByRole("region", { name: "Lộ trình" });
    expect(within(section).getByText("Theo phương án «Kết hợp tối ưu» · chọn ngày 05/03/2026")).toBeTruthy();
    expect(within(section).queryByText("Tạo mục tiêu")).toBeNull();
    expect(within(section).getByText("Giữ quỹ dự phòng")).toBeTruthy();
    expect(within(section).getByText("Cần 45 triệu")).toBeTruthy();
    expect(within(section).getByText("10/01/2000")).toBeTruthy();
    expect(within(section).getByText("từ 01/02/2000 đến 01/12/2000")).toBeTruthy();
    expect(within(section).getByText("Bật trích tự động")).toBeTruthy();
    expect(within(section).getByText("20/05/2999")).toBeTruthy();
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute("data-done")).toBe("true");
    expect(rows[1].getAttribute("data-done")).toBe("true");
    expect(rows[2].getAttribute("data-done")).toBe("false");
    expect(today > "2000-02-01").toBe(true);
  });
});
