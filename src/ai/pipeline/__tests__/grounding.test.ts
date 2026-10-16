import { describe, expect, it } from "vitest";
import { getTool } from "@/ai/tools/registry";
import { runAssistant } from "../orchestrator";
import { validateNumeric } from "../validator";
import { makeCtx, mockClient, collect, ask, textOf } from "./harness";

/**
 * Golden grounding suite (PFM-111): every displayed number must trace to a tool
 * result. Real numbers pass; fabricated numbers are blocked before display.
 */
describe("grounding golden", () => {
  it("a real cashflow figure passes the validator", async () => {
    const ctx = await makeCtx();
    const outcome = getTool("getMonthlyCashflow")!.handler({}, ctx);
    if (!outcome.ok) throw new Error("tool failed");
    const income = ctx.financials.cashflow.income;
    const text = `Thu nhập của bạn là ${income.toLocaleString("vi-VN")} ₫.`;
    expect(validateNumeric(text, [outcome.result]).ok).toBe(true);
  });

  it("a fabricated figure is rejected by the validator", async () => {
    const ctx = await makeCtx();
    const outcome = getTool("getMonthlyCashflow")!.handler({}, ctx);
    if (!outcome.ok) throw new Error("tool failed");
    const text = "Bạn có một khoản ẩn 123.456.789 ₫.";
    expect(validateNumeric(text, [outcome.result]).ok).toBe(false);
  });

  it("end-to-end: a grounded answer is shown; a fabricated one is suppressed", async () => {
    const ctx = await makeCtx();
    const net = ctx.financials.cashflow.net;

    const grounded = mockClient([
      [{ type: "tool_use", id: "t1", name: "getMonthlyCashflow", input: {} }, { type: "done", stopReason: "tool_use" }],
      [{ type: "text", delta: `Dòng tiền ròng của bạn là ${net} ₫.` }, { type: "done", stopReason: "end" }],
    ]);
    expect(textOf(await collect(runAssistant({ messages: ask("Giải thích tháng này"), ctx, client: grounded })))).toContain(String(net));

    const fabricated = mockClient([
      [{ type: "tool_use", id: "t1", name: "getMonthlyCashflow", input: {} }, { type: "done", stopReason: "tool_use" }],
      [{ type: "text", delta: "Tổng tài sản ẩn của bạn là 555.444.333 ₫." }, { type: "done", stopReason: "end" }],
    ]);
    expect(textOf(await collect(runAssistant({ messages: ask("Giải thích tháng này"), ctx, client: fabricated })))).not.toContain("555");
  });
});
