import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GoalActionResult } from "@/lib/agent-goal-api";
import { isGoalUi } from "@/lib/agent-goal-api";
import { isClarifyOptionsUi, type UiPayload } from "@/lib/agent-api";
import payloads from "./fixtures/agent-goal-ui.json";

/**
 * `agent-goal-ui.json` holds `ui` payloads the REAL agent returned (live runs against the real model: every asset category, edit_asset,
 * create_goal with a monthly plan, clarify_options asks). What the chat does with each one: `isGoalUi` / `isClarifyOptionsUi` must accept it
 * (otherwise the widget shows nothing), `AgentGoalUiCard` must render it prefilled, and confirming must send the matching goals action.
 */

const send = vi.fn<(cif: string, action: unknown) => Promise<GoalActionResult>>();
vi.mock("@/lib/agent-goal-api", async (orig) => ({ ...(await orig<typeof import("@/lib/agent-goal-api")>()), sendGoalAction: (cif: string, action: unknown) => send(cif, action) }));
vi.mock("@/providers/context", () => ({ usePersona: () => ({ persona: { cif: "CIF_TEST" } }) }));
vi.mock("@/state/app-clock", () => ({ useAppToday: () => "2026-10-21" }));

import { AgentGoalUiCard } from "../AgentGoalUiCard";

const all = payloads as unknown as (UiPayload & Record<string, unknown>)[];
const goalPayloads = all.filter((p) => p && p.type !== "clarify_options");
const clarify = all.filter((p) => p && p.type === "clarify_options");
const lastAction = () => send.mock.calls.at(-1)![1] as { type: string; [k: string]: unknown };

beforeEach(() => {
  send.mockReset().mockResolvedValue({ ok: true });
  window.sessionStorage.clear();
});

describe("real agent payloads in the chat", () => {
  it("covers every asset category, the three edit_asset changes, create_goal and the clarify asks", () => {
    const add = new Set(goalPayloads.filter((p) => p.type === "add_asset").map((p) => p.category));
    expect([...add].sort()).toEqual(["bond", "car", "deposit", "external_fund", "gold", "house", "motorbike", "other", "stock"]);
    expect(new Set(goalPayloads.filter((p) => p.type === "edit_asset").map((p) => p.change))).toEqual(new Set(["quantity", "remove", "revalue"]));
    expect(goalPayloads.some((p) => p.type === "create_goal")).toBe(true);
    expect(clarify.length).toBeGreaterThan(0);
  });

  it("every goal payload passes the shape guard the widget uses; every clarify payload passes the clarify guard", () => {
    for (const p of goalPayloads) expect(isGoalUi(p), JSON.stringify(p)).toBe(true);
    for (const p of clarify) expect(isClarifyOptionsUi(p), JSON.stringify(p)).toBe(true);
  });

  for (const [i, ui] of goalPayloads.entries()) {
    const label = `${ui.type}${ui.category ? `/${ui.category}` : ""}${ui.change ? `/${ui.change}` : ""} #${i}`;
    it(`${label}: renders prefilled and confirming sends the matching action`, async () => {
      render(<AgentGoalUiCard ui={{ ...(ui as object), reason: `${ui.reason}#${i}` } as never} />);
      if (ui.type === "create_goal") {
        expect((screen.getByLabelText("Tên mục tiêu") as HTMLInputElement).value).toBe(ui.goal_name);
        expect((screen.getByLabelText("Số tiền mục tiêu") as HTMLInputElement).value).toBe(String(ui.target_amount));
        if (ui.monthly_amount !== undefined) expect((screen.getByLabelText("Góp mỗi tháng") as HTMLInputElement).value).toBe(String(ui.monthly_amount));
        fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
        await waitFor(() => expect(send).toHaveBeenCalled());
        expect(lastAction()).toMatchObject({ type: "createGoal", input: { name: ui.goal_name, template: ui.template, targetAmount: ui.target_amount, targetDate: ui.target_date, initialDeposit: ui.initial_deposit } });
        if (ui.monthly_amount !== undefined) expect((lastAction().input as Record<string, unknown>).standingOrder).toEqual({ amount: ui.monthly_amount, dayOfMonth: ui.monthly_day });
      } else if (ui.type === "add_asset") {
        expect((screen.getByLabelText("Tên tài sản") as HTMLInputElement).value).toBe(ui.asset_name);
        expect((screen.getByLabelText("Phần tính vào mục tiêu (%)") as HTMLInputElement).value).toBe(String(ui.count_percent));
        fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
        await waitFor(() => expect(send).toHaveBeenCalled());
        expect(lastAction()).toMatchObject({ type: "addAsset", goalId: ui.goal_id, category: ui.category, countPercent: ui.count_percent });
        if (ui.instrument_id) expect(lastAction()).toMatchObject({ instrumentId: ui.instrument_id, quantity: ui.quantity, value: 0 });
        if (ui.accrual) expect(lastAction()).toMatchObject({ accrual: { principal: (ui.accrual as { principal: number }).principal, ratePa: (ui.accrual as { rate_pa: number }).rate_pa } });
        if (ui.value !== undefined) expect(lastAction()).toMatchObject({ value: ui.value, source: "self_reported" });
      } else if (ui.type === "edit_asset") {
        const button = ui.change === "remove" ? "Bỏ tài sản" : "Cập nhật tài sản";
        fireEvent.click(screen.getByRole("button", { name: button }));
        await waitFor(() => expect(send).toHaveBeenCalled());
        const expected = { revalue: "revalueAsset", quantity: "setAssetQuantity", remove: "removeAsset" }[ui.change as string];
        expect(lastAction()).toMatchObject({ type: expected, assetId: ui.asset_id });
      }
    });
  }
});
