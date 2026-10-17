// Fixed Vietnamese sentences for the analysis card (no LLM). Numbers come from the engine's Analysis.
import { formatGoalMoney } from "../ui/shared/format-goal-money";
import type { Analysis, AnalyzeDraft } from "./analysis-types";

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Step 1: what we understood from the customer's words. */
export function understoodSentence(d: AnalyzeDraft, months: number): string {
  return `Bạn muốn có ${formatGoalMoney(d.targetAmount)} cho “${d.name}” trong khoảng ${months} tháng (đến ${dmy(d.targetDate)}).`;
}

/** Step 2: what the cash flow shows. */
export function cashflowSentence(a: Analysis): string {
  if (a.surplus === "unknown") return "Chưa đủ dữ liệu thu chi để tính phần dư hàng tháng.";
  if (a.surplus <= 0) return `Trung bình ${a.provenance.monthsUsed} tháng gần đây, bạn chưa có phần dư sau khi chi tiêu.`;
  return `Trung bình ${a.provenance.monthsUsed} tháng gần đây, mỗi tháng bạn còn dư khoảng ${formatGoalMoney(a.surplus)}.`;
}

/** Step 3: the conclusion, in the tone that matches the verdict. */
export function verdictSentence(a: Analysis): string {
  const need = formatGoalMoney(a.requiredMonthly);
  const share = a.gapMultiple === null ? null : Math.round(a.gapMultiple * 100);
  switch (a.verdict) {
    case "feasible":
      return share === null
        ? `Mục tiêu khả thi: bạn cần góp khoảng ${need}/tháng.`
        : `Mục tiêu khả thi: cần góp khoảng ${need}/tháng, tương đương ${share}% phần dư.`;
    case "stretch":
      return `Làm được nhưng khá sát: cần góp ${need}/tháng, gần hết phần dư mỗi tháng.`;
    case "not_feasible":
      return a.gapMultiple === null
        ? `Hiện chưa có phần dư để dành ${need}/tháng. Mình gợi ý vài hướng điều chỉnh bên dưới.`
        : `Chưa khả thi theo kế hoạch này: cần góp ${need}/tháng, gấp ${a.gapMultiple.toLocaleString("vi-VN")} lần phần dư. Mình gợi ý vài hướng điều chỉnh bên dưới.`;
    case "unknown":
      return `Cần góp khoảng ${need}/tháng, nhưng chưa đủ dữ liệu để so với phần dư của bạn.`;
  }
}
