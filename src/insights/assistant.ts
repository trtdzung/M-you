/**
 * Deterministic assistant answers. The prototype assistant EXPLAINS numbers from
 * the engine — it never moves money or fabricates figures. Every answer is
 * templated from Financials; there is no free-form generation path.
 */

import type { Financials } from "@/state/useFinancials";
import { formatRelativeDate, formatVnd } from "@/lib/format";
import { DEMO_NOW, monthKeyLabel } from "@/lib/demo-clock";

export interface AssistantAnswer {
  lines: string[];
  sources: string[];
}

export interface SuggestedPrompt {
  id: string;
  label: string;
}

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { id: "explain_month", label: "Giải thích tháng này" },
  { id: "top_category", label: "Tôi tiêu nhiều nhất vào đâu?" },
  { id: "upcoming", label: "Sắp tới phải trả gì?" },
];

export function answerPrompt(id: string, f: Financials): AssistantAnswer {
  switch (id) {
    case "explain_month":
      return {
        lines: [
          `Trong ${monthKeyLabel(f.monthKey)}, thu nhập của bạn là ${formatVnd(f.cashflow.income)}.`,
          `Chi tiêu là ${formatVnd(f.cashflow.expense)} (cố định ${formatVnd(f.cashflow.fixed)}, linh hoạt ${formatVnd(f.cashflow.discretionary)}).`,
          `Dòng tiền ròng ${f.cashflow.net >= 0 ? "dương" : "âm"}: ${formatVnd(f.cashflow.net)}.`,
        ],
        sources: ["Dòng tiền tính từ giao dịch (đã loại chuyển khoản nội bộ)"],
      };
    case "top_category": {
      const top = f.categorySpend[0];
      if (!top) return { lines: ["Chưa có chi tiêu nào trong tháng này."], sources: [] };
      return {
        lines: [
          `Bạn chi nhiều nhất cho "${top.label}": ${formatVnd(top.amount)} (${Math.round(top.share * 100)}% chi tiêu).`,
        ],
        sources: ["Chi theo danh mục, đã trừ hoàn tiền"],
      };
    }
    case "upcoming": {
      if (f.obligations.length === 0) return { lines: ["Không có khoản nào đến hạn trong 30 ngày tới."], sources: [] };
      const lines = f.obligations.map(
        (o) =>
          `${o.label}: ${o.amount === "unknown" ? "chưa rõ số tiền" : formatVnd(o.amount)} — ${formatRelativeDate(o.dueDate, DEMO_NOW)}.`,
      );
      return { lines, sources: ["Từ dư nợ và khoản chi định kỳ phát hiện được"] };
    }
    case "networth": {
      const nw = f.networth;
      const lines = [
        `Giá trị ròng hiện tại khoảng ${formatVnd(nw.total)} (tài sản ${formatVnd(nw.assetsTotal)}, nợ ${formatVnd(nw.liabilitiesTotal)}).`,
      ];
      if (nw.hasUnknown) {
        lines.push(`Lưu ý: một số tài sản chưa định giá (${nw.unknownFields.join(", ")}) nên con số chưa đầy đủ.`);
      }
      return { lines, sources: ["Tài sản − nợ theo dữ liệu bạn khai báo/đồng bộ"] };
    }
    default:
      return { lines: ["Xin lỗi, tôi chưa hỗ trợ câu hỏi này."], sources: [] };
  }
}
