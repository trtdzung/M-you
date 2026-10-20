import { describe, expect, it } from "vitest";
import { isPlanRoadmapUi } from "../agent-plan-api";
import type { UiPayload } from "../agent-api";

const milestone = (over: Record<string, unknown> = {}) => ({ when: "Tháng 0", kind: "reserve", title: "Giữ quỹ dự phòng", ...over });
const plan = (over: Record<string, unknown> = {}) => ({
  id: "no_loan",
  name: "Không vay",
  verdict: "ok",
  headline: "Đạt mục tiêu ở tháng 100 (năm thứ 9), đúng hạn",
  metrics: [{ label: "Lãi tiết kiệm", value: "100 triệu" }],
  milestones: [milestone()],
  choice_text: "Tôi chọn phương án Không vay",
  ...over,
});
const card = (over: Record<string, unknown> = {}) => ({
  type: "plan_roadmap",
  title: "Căn hộ 1,2 tỷ · 10 năm",
  baseline: "Đạt mục tiêu ở tháng 130",
  assumptions: ["Lãi tiết kiệm 6,8%/năm"],
  plans: [plan()],
  ...over,
});
const ok = (v: unknown) => isPlanRoadmapUi(v as UiPayload);
const s = (n: number) => "x".repeat(n);

describe("isPlanRoadmapUi", () => {
  it("accepts a full valid card and a minimal one", () => {
    expect(ok(card())).toBe(true);
    expect(ok({ type: "plan_roadmap", title: "a", baseline: "b", assumptions: [], plans: [plan({ metrics: [], milestones: [milestone()] })] })).toBe(true);
  });
  it("accepts optional reason/risk/detail/action and three plans with one recommended", () => {
    const plans = [
      plan({ id: "no_loan", verdict: "late", risk: "Nếu thu nhập không tăng", milestones: [milestone({ detail: "d", action: "a" })] }),
      plan({ id: "loan_now", verdict: "not_recommended", reason: "Không khả thi", milestones: [], choice_text: undefined }),
      plan({ id: "optimized", verdict: "recommended" }),
    ];
    expect(ok(card({ plans }))).toBe(true);
  });
  it("accepts a not_recommended plan without milestones", () => {
    expect(ok(card({ plans: [plan({ verdict: "not_recommended", reason: "r", milestones: [], choice_text: undefined })] }))).toBe(true);
  });
  it.each([null, undefined, "x", 3, [], {}, { type: "chart" }])("rejects non-card input %j", (v) => {
    expect(ok(v)).toBe(false);
  });
  it("rejects extra keys at root, plan, metric and milestone level", () => {
    expect(ok(card({ extra: 1 }))).toBe(false);
    expect(ok(card({ plans: [plan({ extra: 1 })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ metrics: [{ label: "a", value: "b", x: 1 }] })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [milestone({ x: 1 })] })] }))).toBe(false);
  });
  it("rejects bad enums", () => {
    expect(ok(card({ plans: [plan({ id: "other" })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ verdict: "great" })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [milestone({ kind: "jump" })] })] }))).toBe(false);
  });
  it("rejects 0 or 4 plans, duplicate ids and two recommended", () => {
    expect(ok(card({ plans: [] }))).toBe(false);
    const four = ["no_loan", "loan_now", "optimized", "no_loan"].map((id) => plan({ id }));
    expect(ok(card({ plans: four }))).toBe(false);
    expect(ok(card({ plans: [plan(), plan()] }))).toBe(false);
    expect(ok(card({ plans: [plan({ verdict: "recommended" }), plan({ id: "loan_now", verdict: "recommended" })] }))).toBe(false);
  });
  it("enforces choice_text rules", () => {
    expect(ok(card({ plans: [plan({ choice_text: undefined })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ verdict: "not_recommended", reason: "r", milestones: [] })] }))).toBe(false);
  });
  it("requires a reason for not_recommended and milestones otherwise", () => {
    expect(ok(card({ plans: [plan({ verdict: "not_recommended", milestones: [], choice_text: undefined })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [] })] }))).toBe(false);
  });
  it("enforces counts", () => {
    const m = (n: number) => Array.from({ length: n }, () => ({ label: "a", value: "b" }));
    expect(ok(card({ plans: [plan({ metrics: m(4) })] }))).toBe(true);
    expect(ok(card({ plans: [plan({ metrics: m(5) })] }))).toBe(false);
    const ms = (n: number) => Array.from({ length: n }, () => milestone());
    expect(ok(card({ plans: [plan({ milestones: ms(10) })] }))).toBe(true);
    expect(ok(card({ plans: [plan({ milestones: ms(11) })] }))).toBe(false);
    expect(ok(card({ assumptions: Array.from({ length: 8 }, () => "a") }))).toBe(true);
    expect(ok(card({ assumptions: Array.from({ length: 9 }, () => "a") }))).toBe(false);
  });
  it("enforces string lengths and non-empty strings", () => {
    expect(ok(card({ title: s(80) }))).toBe(true);
    expect(ok(card({ title: s(81) }))).toBe(false);
    expect(ok(card({ title: "" }))).toBe(false);
    expect(ok(card({ baseline: s(201) }))).toBe(false);
    expect(ok(card({ assumptions: [s(81)] }))).toBe(false);
    expect(ok(card({ assumptions: [""] }))).toBe(false);
    expect(ok(card({ assumptions: [1] }))).toBe(false);
    expect(ok(card({ plans: [plan({ name: s(41) })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ headline: s(161) })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ risk: s(241) })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ choice_text: s(121) })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ metrics: [{ label: s(31), value: "b" }] })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ metrics: [{ label: "a", value: s(41) }] })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [milestone({ when: s(31) })] })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [milestone({ title: s(61) })] })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [milestone({ detail: s(201) })] })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [milestone({ action: s(121) })] })] }))).toBe(false);
  });
  it("never throws on odd shapes", () => {
    expect(ok(card({ plans: [null] }))).toBe(false);
    expect(ok(card({ plans: "x" }))).toBe(false);
    expect(ok(card({ plans: [plan({ metrics: [null] })] }))).toBe(false);
    expect(ok(card({ plans: [plan({ milestones: [1] })] }))).toBe(false);
  });
  it("counts length in code points, like the Python validator", () => {
    expect(ok(card({ title: "🏠".repeat(70) + " · 40 năm" }))).toBe(true);
    expect(ok(card({ title: "🏠".repeat(81) }))).toBe(false);
  });
});
