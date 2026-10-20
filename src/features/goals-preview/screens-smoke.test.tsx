import React from "react";
import { render, waitFor, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIOS } from "./data/scenarios";
import { stateFromScenario } from "./store/reducer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} }), usePathname: () => "/goals", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/providers/context", () => ({ usePersonaCif: () => "CIF_0001" }));
vi.mock("@/components/shell/PanelActive", () => ({ usePanelActive: () => true }));

import { PreviewStoreProvider, usePreview } from "./store/PreviewStore";
import { ScreenHost } from "./ui/ScreenHost";

const box = vi.hoisted(() => ({ ctx: null as any }));
function Probe() {
  box.ctx = usePreview();
  return null;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SCREENS = ["GoalList", "GoalDetail", "DepositFlow", "WithdrawFlow", "StandingOrderManage", "EditTarget", "CloseGoalFlow", "AddAsset", "InvestSuggest", "LoanAppHome", "LoanAppSurvey", "LoanSimulator", "LoanApply", "RepayOverview", "RepaySchedule", "Prepay", "DueResult", "AchievedIntro", "MissedOptions", "TemplatePick", "GoalInfo" ] as const;

describe("smoke: mọi màn render không lỗi / không vòng lặp", () => {
  for (const sc of SCENARIOS) {
    it(sc.id, async () => {
      const world = stateFromScenario(sc.id);
      vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("suggestions")) return new Response(JSON.stringify({ suggestions: [], refreshing: false }));
        return new Response(JSON.stringify({ world: { ...world, customer: { ...world.customer, cif: "CIF_0001" } }, market: { instruments: [], refreshing: false, asOf: null } }));
      }));
      const errors: string[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(String(a[0]).slice(0, 200)); });
      render(<PreviewStoreProvider><Probe /><ScreenHost /></PreviewStoreProvider>);
      await waitFor(() => expect(box.ctx?.loadStatus).toBe("ready"));
      const goals = box.ctx.state.goals as { id: string; accountId?: string }[];
      const goalId = goals[0]?.id;
      const assetId = (box.ctx.state.assets as { id: string; type: string }[]).find((a) => a.type === "msb")?.id;
      for (const screen of SCREENS) {
        await act(async () => { box.ctx.nav.push(screen, { goalId, loanId: box.ctx.state.loans[0]?.id, assetId }); });
      }
      for (const tab of ["cash", "assets", "overview"]) {
        await act(async () => { box.ctx.nav.push("GoalDetail", { goalId, tab }); });
      }
      spy.mockRestore();
      expect(errors, errors.join("\n")).toEqual([]);
    }, 30000);
  }
});

describe("EditTarget: đổi giá trị mục tiêu rồi xem lại và xác nhận", () => {
  it("tính lại số tiền góp hằng tháng và áp dụng khi xác nhận", async () => {
    const world = stateFromScenario("s13-loan-blocked");
    const posted: { type: string; [k: string]: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") posted.push(JSON.parse(String(init.body)).action);
      if (String(url).includes("suggestions")) return new Response(JSON.stringify({ suggestions: [], refreshing: false }));
      return new Response(JSON.stringify({ world: { ...world, customer: { ...world.customer, cif: "CIF_0001" } }, market: { instruments: [], refreshing: false, asOf: null } }));
    }));
    const { getByRole, findByText, getByText, queryByText } = render(<PreviewStoreProvider><Probe /><ScreenHost /></PreviewStoreProvider>);
    await waitFor(() => expect(box.ctx?.loadStatus).toBe("ready"));
    const goal = box.ctx.state.goals[0];
    await act(async () => { box.ctx.nav.push("EditTarget", { goalId: goal.id }); });

    const field = document.querySelector("input") as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    await act(async () => { fireEvent.change(field, { target: { value: "6000000000" } }); });
    const dateInput = document.getElementById("target-date") as HTMLInputElement;
    await act(async () => { fireEvent.change(dateInput, { target: { value: "2035-06-15" } }); });
    await act(async () => { fireEvent.click(getByRole("button", { name: "Xem lại kế hoạch" })); });
    await findByText("Cần góp mỗi tháng (tính lại)");
    expect(getByText(/5 tỷ đồng → 6 tỷ đồng/)).toBeTruthy();
    expect(getByText(/→ 15\/06\/2035/)).toBeTruthy();

    await act(async () => { fireEvent.click(getByRole("button", { name: "Xác nhận thay đổi" })); });
    await waitFor(() => expect(posted.some((a) => a.type === "reduceTarget")).toBe(true));
    expect(posted.find((a) => a.type === "reduceTarget")).toMatchObject({ goalId: goal.id, newTargetAmount: 6_000_000_000 });
    expect(posted.find((a) => a.type === "extend")).toMatchObject({ goalId: goal.id, newTargetDate: "2035-06-15" });
    expect(posted.find((a) => a.type === "setStandingOrder")).toMatchObject({ goalId: goal.id });
    expect(queryByText("Xem lại kế hoạch")).toBeNull();
  });
});
