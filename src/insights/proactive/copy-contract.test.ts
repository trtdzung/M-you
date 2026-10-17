import { describe, expect, it } from "vitest";
import { validateCopyOutput } from "./copy-contract";

const request = { insightType: "jar_plan_pressure", allowedActionKeys: ["review_jars"],
  allowedFactIds: ["jar_label", "budget_limit", "spent", "remaining"] };

describe("proactive copy output guard", () => {
  it("accepts bounded numeric-free copy citing supplied facts", () => {
    expect(validateCopyOutput(request, { status: "RENDERABLE", title: "Hũ Ăn uống gần hạn mức",
      body: "Bạn có thể xem lại chi tiêu trong hũ này.", actionKey: "review_jars",
      usedFactIds: ["jar_label", "spent"] })?.status).toBe("RENDERABLE");
  });
  it("rejects invented actions, unseen facts, embedded numbers and extra keys", () => {
    const base = { status: "RENDERABLE", title: "Hũ Ăn uống gần hạn mức",
      body: "Bạn có thể xem lại chi tiêu trong hũ này.", actionKey: "review_jars", usedFactIds: ["spent"] };
    expect(validateCopyOutput(request, { ...base, actionKey: "buy_product" })).toBeNull();
    expect(validateCopyOutput(request, { ...base, usedFactIds: ["due_date"] })).toBeNull();
    expect(validateCopyOutput(request, { ...base, body: "Còn 100.000 đồng." })).toBeNull();
    expect(validateCopyOutput(request, { ...base, productId: "abc" })).toBeNull();
  });
  it("accepts explicit inability to render and rejects malformed fallback", () => {
    expect(validateCopyOutput(request, { status: "UNRENDERABLE", reason: "Thiếu bằng chứng cần thiết" }))
      .toEqual({ status: "UNRENDERABLE", reason: "Thiếu bằng chứng cần thiết" });
    expect(validateCopyOutput(request, { status: "UNRENDERABLE", reason: "Thiếu 1 khoản" })).toBeNull();
  });
  it.each([
    {
      name: "uncovered jar balance",
      request: { insightType: "jar_plan_pressure", allowedActionKeys: ["review_jars"], allowedFactIds: ["jar_label", "remaining"] },
      output: { status: "RENDERABLE", title: "Hũ Ăn uống cần bù",
        body: "Hũ này đã chi quá số dư và cần được xem lại.", actionKey: "review_jars",
        usedFactIds: ["jar_label", "remaining"] },
    },
    {
      name: "category spending spike",
      request: { insightType: "spending_spike", allowedActionKeys: ["review_spending"],
        allowedFactIds: ["category_label", "current_spend", "previous_spend"] },
      output: { status: "RENDERABLE", title: "Chi cho Ăn uống tăng",
        body: "Chi tiêu ở danh mục này cao hơn kỳ trước. Bạn có thể xem lại các khoản đã ghi nhận.",
        actionKey: "review_spending", usedFactIds: ["category_label", "current_spend", "previous_spend"] },
    },
    {
      name: "known minimum payment reminder",
      request: { insightType: "known_payment_due_reminder", allowedActionKeys: ["review_payments"],
        allowedFactIds: ["liability_label", "minimum_payment", "due_date"] },
      output: { status: "RENDERABLE", title: "Sắp đến hạn thanh toán tối thiểu",
        body: "Theo thông tin đang ghi nhận, khoản thanh toán tối thiểu của thẻ sắp đến hạn. Bạn có thể kiểm tra lại lịch trả.",
        actionKey: "review_payments", usedFactIds: ["liability_label", "minimum_payment", "due_date"] },
    },
  ])("accepts golden copy for $name", ({ request, output }) => {
    expect(validateCopyOutput(request, output)?.status).toBe("RENDERABLE");
  });
});
