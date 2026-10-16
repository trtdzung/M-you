/**
 * Tier A read tools — whitelisted, read-only analytics wrapping the engine. Each
 * resolves its period (defaulting to the context month), reads figures from the
 * deterministic financials, and attaches provenance. No number is computed here.
 */

import { computeFinancials, type Financials } from "@/domain/engine/finance-compose";
import { upcomingObligations } from "@/domain/engine";
import { isKnown } from "@/domain/engine/types";
import { monthKeyLabel, DEMO_NOW } from "@/lib/demo-clock";
import type { AiContext } from "@/ai/server/load-financials";
import { ok, strField, numField, type AiTool } from "./types";

/** Financials for the requested "YYYY-MM" period (reuses context when it matches). */
function financialsFor(ctx: AiContext, period?: string): { fin: Financials; month: string } {
  const month = period ?? ctx.monthKey;
  const fin = month === ctx.monthKey ? ctx.financials : computeFinancials(ctx.raw, month);
  return { fin, month };
}

const PERIOD_SCHEMA = {
  type: "object",
  properties: { period: { type: "string", description: 'Kỳ "YYYY-MM", mặc định tháng đang xem.' } },
} as const;

export const getMonthlyCashflow: AiTool = {
  name: "getMonthlyCashflow",
  description: "Thu nhập, chi tiêu, dòng tiền ròng, cố định/linh hoạt của một tháng.",
  inputSchema: PERIOD_SCHEMA as Record<string, unknown>,
  handler(input, ctx) {
    const { fin, month } = financialsFor(ctx, strField(input, "period"));
    const cf = fin.cashflow;
    const label = monthKeyLabel(month);
    return ok({
      data: {
        period: month,
        income: cf.income,
        expense: cf.expense,
        net: cf.net,
        fixed: cf.fixed,
        discretionary: cf.discretionary,
        pendingExpense: cf.pendingExpense,
      },
      sources: [`Dòng tiền ${label} — từ giao dịch, đã loại chuyển khoản nội bộ & thanh toán thẻ.`],
      period: label,
    });
  },
};

export const getSpendingByCategory: AiTool = {
  name: "getSpendingByCategory",
  description: "Chi tiêu theo danh mục của một tháng (đã trừ hoàn tiền), kèm tỷ trọng.",
  inputSchema: {
    type: "object",
    properties: {
      period: { type: "string", description: 'Kỳ "YYYY-MM", mặc định tháng đang xem.' },
      topN: { type: "number", description: "Số danh mục hàng đầu cần trả (tuỳ chọn)." },
    },
  } as Record<string, unknown>,
  handler(input, ctx) {
    const { fin, month } = financialsFor(ctx, strField(input, "period"));
    const topN = numField(input, "topN");
    const rows = typeof topN === "number" ? fin.categorySpend.slice(0, Math.max(0, topN)) : fin.categorySpend;
    const total = fin.categorySpend.reduce((s, c) => s + c.amount, 0);
    return ok({
      data: {
        period: month,
        total,
        categories: rows.map((c) => ({
          categoryId: c.categoryId,
          label: c.label,
          amount: c.amount,
          sharePct: Math.round(c.share * 100),
        })),
      },
      sources: [`Chi theo danh mục ${monthKeyLabel(month)} — đã trừ hoàn tiền.`],
      period: monthKeyLabel(month),
    });
  },
};

export const getUpcomingObligations: AiTool = {
  name: "getUpcomingObligations",
  description: "Các khoản đến hạn trong N ngày tới (nợ + chi định kỳ). Số tiền có thể chưa rõ.",
  inputSchema: {
    type: "object",
    properties: { horizonDays: { type: "number", description: "Số ngày nhìn tới, mặc định 30." } },
  } as Record<string, unknown>,
  handler(input, ctx) {
    const horizonDays = numField(input, "horizonDays") ?? 30;
    const obligations =
      horizonDays === 30
        ? ctx.financials.obligations
        : upcomingObligations(ctx.financials.recurring, ctx.raw.liabilities, { now: DEMO_NOW, horizonDays });
    return ok({
      data: {
        horizonDays,
        obligations: obligations.map((o) => ({
          label: o.label,
          amount: isKnown(o.amount) ? o.amount : "unknown",
          dueDate: o.dueDate,
          kind: o.kind,
        })),
      },
      sources: ["Từ dư nợ (ngày đến hạn) và các khoản chi định kỳ phát hiện được."],
    });
  },
};

export const calculateNetWorth: AiTool = {
  name: "calculateNetWorth",
  description: "Tài sản, nợ và giá trị ròng hiện tại, kèm độ phủ dữ liệu (tài sản chưa định giá).",
  inputSchema: { type: "object", properties: {} } as Record<string, unknown>,
  handler(_input, ctx) {
    const nw = ctx.financials.networth;
    return ok({
      data: {
        assetsTotal: nw.assetsTotal,
        liabilitiesTotal: nw.liabilitiesTotal,
        net: nw.total,
        hasUnknown: nw.hasUnknown,
        unknownFields: nw.unknownFields,
      },
      sources: [
        nw.hasUnknown
          ? `Giá trị ròng — một phần tài sản chưa định giá (${nw.unknownFields.join(", ")}).`
          : "Giá trị ròng = tài sản − nợ (theo dữ liệu bạn khai báo/đồng bộ).",
      ],
      period: "Hiện tại",
    });
  },
};

export const READ_TOOLS: AiTool[] = [
  getMonthlyCashflow,
  getSpendingByCategory,
  getUpcomingObligations,
  calculateNetWorth,
];
