import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOAL_SAVE_FAILED,
  isAddAssetUi,
  isCloseGoalUi,
  isCreateGoalUi,
  isEditAssetUi,
  isEditGoalUi,
  isGoalUi,
  sendGoalAction,
} from "../agent-goal-api";
import type { UiPayload } from "../agent-api";

const ui = (o: object) => o as UiPayload;
const CREATE = { type: "create_goal", goal_name: "Mua xe", template: "car", target_amount: 600_000_000, target_date: "2027-12-31", flexibility: "date_flexible", initial_deposit: 5_000_000, reason: "x" };
const EDIT = { type: "edit_goal", goal_id: "goal-1", goal_name: "Mua xe", new_target_date: "2028-03-31", reason: "x" };
const CLOSE = { type: "close_goal", goal_id: "goal-1", goal_name: "Mua xe", reason: "x" };
const HAND = { type: "add_asset", goal_id: "goal-1", category: "motorbike", asset_name: "Xe máy", value: 30_000_000, count_percent: 100, reason: "x" };
const MARKET = { type: "add_asset", goal_id: "goal-1", category: "gold", asset_name: "Vàng", instrument_id: "gold-ring", quantity: 2, count_percent: 100, reason: "x" };
const DEPOSIT = { type: "add_asset", goal_id: "goal-1", category: "deposit", asset_name: "Gửi", accrual: { principal: 5e7, rate_pa: 5.2, start_date: "2026-06-01", maturity_date: "2027-06-01" }, count_percent: 100, reason: "x" };
const REVALUE = { type: "edit_asset", asset_id: "asset-4", asset_name: "Xe máy", change: "revalue", value: 28_000_000, reason: "x" };

describe("goal proposal guards (shape only)", () => {
  it("accept the documented payloads", () => {
    expect(isCreateGoalUi(ui(CREATE))).toBe(true);
    expect(isEditGoalUi(ui(EDIT))).toBe(true);
    expect(isEditGoalUi(ui({ ...EDIT, new_target_date: undefined, new_target_amount: 5e8 }))).toBe(true);
    expect(isCloseGoalUi(ui(CLOSE))).toBe(true);
    for (const a of [HAND, MARKET, DEPOSIT]) expect(isAddAssetUi(ui(a))).toBe(true);
    expect(isEditAssetUi(ui(REVALUE))).toBe(true);
    expect(isEditAssetUi(ui({ ...REVALUE, change: "quantity", value: undefined, quantity: 3 }))).toBe(true);
    expect(isEditAssetUi(ui({ type: "edit_asset", asset_id: "a", asset_name: "n", change: "remove", reason: "x" }))).toBe(true);
    expect(isGoalUi(ui(CREATE))).toBe(true);
  });

  it("monthly plan: both fields or none; flexibility is optional", () => {
    const { flexibility: _f, ...noFlex } = CREATE as Record<string, unknown>;
    expect(isCreateGoalUi(ui(noFlex))).toBe(true);
    expect(isCreateGoalUi(ui({ ...noFlex, monthly_amount: 8_000_000, monthly_day: 6 }))).toBe(true);
    expect(isCreateGoalUi(ui({ ...noFlex, monthly_amount: 8_000_000 }))).toBe(false);
    expect(isCreateGoalUi(ui({ ...noFlex, monthly_day: 6 }))).toBe(false);
    expect(isCreateGoalUi(ui({ ...noFlex, monthly_amount: 8_000_000, monthly_day: 31 }))).toBe(false);
    expect(isCreateGoalUi(ui({ ...noFlex, monthly_amount: 0, monthly_day: 6 }))).toBe(false);
    expect(isEditGoalUi(ui({ type: "edit_goal", goal_id: "g", goal_name: "n", monthly_amount: 4_000_000, monthly_day: 15, reason: "x" }))).toBe(true);
    expect(isEditGoalUi(ui({ type: "edit_goal", goal_id: "g", goal_name: "n", monthly_amount: 4_000_000, reason: "x" }))).toBe(false);
  });

  it("refuse the shapes the agent validator refuses", () => {
    expect(isCreateGoalUi(ui({ ...CREATE, template: "boat" }))).toBe(false);
    expect(isCreateGoalUi(ui({ ...CREATE, target_amount: 1.5 }))).toBe(false);
    expect(isCreateGoalUi(ui({ ...CREATE, target_date: "31/12/2027" }))).toBe(false);
    expect(isCreateGoalUi(ui({ ...CREATE, initial_deposit: -1 }))).toBe(false);
    expect(isCreateGoalUi(ui({ ...CREATE, goal_id: "goal-9" }))).toBe(false);
    expect(isEditGoalUi(ui({ ...EDIT, new_target_date: undefined }))).toBe(false);
    expect(isCloseGoalUi(ui({ ...CLOSE, extra: 1 }))).toBe(false);
    expect(isAddAssetUi(ui({ ...HAND, value: undefined }))).toBe(false);
    expect(isAddAssetUi(ui({ ...HAND, count_percent: 101 }))).toBe(false);
    expect(isAddAssetUi(ui({ ...HAND, category: "crypto" }))).toBe(false);
    expect(isAddAssetUi(ui({ ...MARKET, quantity: 0 }))).toBe(false);
    expect(isAddAssetUi(ui({ ...MARKET, value: 1 }))).toBe(false);
    expect(isAddAssetUi(ui({ ...DEPOSIT, accrual: { principal: 1, rate_pa: 5, start_date: "2026-06-01", maturity_date: "2026-01-01" } }))).toBe(false);
    expect(isEditAssetUi(ui({ ...REVALUE, value: undefined }))).toBe(false);
    expect(isEditAssetUi(ui({ type: "edit_asset", asset_id: "a", asset_name: "n", change: "remove", quantity: 1, reason: "x" }))).toBe(false);
    expect(isGoalUi(null)).toBe(false);
    expect(isGoalUi(ui({ type: "chart" }))).toBe(false);
  });
});

describe("sendGoalAction", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("posts cif, a fresh requestId and the action", async () => {
    const fetchMock = respond(200, { createdGoalId: "goal-7" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendGoalAction("CIF_1", { type: "closeGoal", goalId: "goal-1" });
    expect(result).toEqual({ ok: true, createdGoalId: "goal-7" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/goals-v2/actions");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ cif: "CIF_1", action: { type: "closeGoal", goalId: "goal-1" } });
    expect(typeof body.requestId).toBe("string");
  });

  it("returns the server's reason on 422 and a generic message on other failures", async () => {
    vi.stubGlobal("fetch", respond(422, { error: "Tài khoản chính không đủ số dư để nạp ban đầu." }));
    expect(await sendGoalAction("CIF_1", { type: "createGoal", input: { name: "x", template: "other", targetAmount: 1, targetDate: "2030-01-01", flexibility: "date_flexible", initialDeposit: 1 } })).toEqual({ ok: false, error: "Tài khoản chính không đủ số dư để nạp ban đầu." });
    vi.stubGlobal("fetch", respond(500, {}));
    expect(await sendGoalAction("CIF_1", { type: "closeGoal", goalId: "g" })).toEqual({ ok: false, error: GOAL_SAVE_FAILED });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await sendGoalAction("CIF_1", { type: "closeGoal", goalId: "g" })).toEqual({ ok: false, error: GOAL_SAVE_FAILED });
  });
});
