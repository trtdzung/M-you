/**
 * Tier A simulation tools — deterministic what-ifs (goal, debt). They resolve the
 * target entity from context, call the engine (never compute here), and return the
 * projection series for a mini chart. Ambiguous/absent id → structured error.
 */

import { simulateGoal, simulateDebtRepayment } from "@/domain/engine";
import { DEMO_NOW } from "@/lib/demo-clock";
import type { AiContext } from "@/ai/server/load-financials";
import { ok, fail, strField, numField, type AiTool } from "./types";

/** Pick an entity by id, or the sole entity, or explain the ambiguity. */
function resolveOne<T extends { id: string; name: string }>(
  items: T[],
  id: string | undefined,
  noun: string,
): { item: T } | { error: string } {
  if (items.length === 0) return { error: `Chưa có ${noun} nào để mô phỏng.` };
  if (id) {
    const found = items.find((i) => i.id === id);
    return found ? { item: found } : { error: `Không tìm thấy ${noun} với id "${id}".` };
  }
  if (items.length === 1) return { item: items[0] };
  const names = items.map((i) => `"${i.name}"`).join(", ");
  return { error: `Có nhiều ${noun}: ${names}. Bạn muốn mô phỏng khoản nào?` };
}

export const simulateGoalTool: AiTool = {
  name: "simulateGoal",
  description: "Mô phỏng: nếu tiết kiệm X ₫/tháng thì bao giờ đạt mục tiêu. Trả về chuỗi dự phóng.",
  inputSchema: {
    type: "object",
    properties: {
      goalId: { type: "string", description: "Id mục tiêu (bỏ trống nếu chỉ có một)." },
      monthlyContribution: { type: "number", description: "Số tiền đóng góp mỗi tháng (VND)." },
    },
  } as Record<string, unknown>,
  handler(input, ctx: AiContext) {
    const resolved = resolveOne(ctx.raw.goals, strField(input, "goalId"), "mục tiêu");
    if ("error" in resolved) return fail(resolved.error);
    const projection = simulateGoal(resolved.item, {
      monthlyContribution: numField(input, "monthlyContribution") ?? null,
      asOf: DEMO_NOW,
    });
    return ok({
      data: { ...projection },
      sources: [`Mục tiêu "${projection.goalName}" — do bạn tự khai báo. Dự phóng theo giả định đóng góp đều.`],
    });
  },
};

export const simulateDebtRepaymentTool: AiTool = {
  name: "simulateDebtRepayment",
  description: "Mô phỏng: nếu trả X ₫/tháng thì bao giờ tất toán khoản nợ và tổng lãi ước tính.",
  inputSchema: {
    type: "object",
    properties: {
      liabilityId: { type: "string", description: "Id khoản nợ (bỏ trống nếu chỉ có một)." },
      monthlyPayment: { type: "number", description: "Số tiền trả mỗi tháng (VND)." },
    },
  } as Record<string, unknown>,
  handler(input, ctx: AiContext) {
    const resolved = resolveOne(ctx.raw.liabilities, strField(input, "liabilityId"), "khoản nợ");
    if ("error" in resolved) return fail(resolved.error);
    const projection = simulateDebtRepayment(resolved.item, {
      monthlyPayment: numField(input, "monthlyPayment") ?? null,
      asOf: DEMO_NOW,
    });
    return ok({
      data: { ...projection },
      sources: [`Khoản nợ "${projection.liabilityName}" — dự phóng amortization theo lãi suất và khoản trả giả định.`],
    });
  },
};

export const SIM_TOOLS: AiTool[] = [simulateGoalTool, simulateDebtRepaymentTool];
