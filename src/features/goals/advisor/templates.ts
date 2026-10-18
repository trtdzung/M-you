// Fixed Vietnamese sentences for the analysis card (no LLM). Numbers come from the engine's Analysis.
import { formatGoalMoney as compactMoney } from "../ui/shared/format-goal-money";
import type { CoachAdjustment } from "../coach/contracts";
import type { Analysis, AnalyzeDraft, Plan, PlanCut } from "./analysis-types";

const formatGoalMoney = (amount: number) => `${compactMoney(amount)} VND`;

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

const perMonth = (n: number) => `${formatGoalMoney(n)}/tháng`;

/** One line per plan: what changes and what it costs each month. */
export function planSummary(plan: Plan): string {
  const monthly = perMonth(plan.monthly);
  switch (plan.id) {
    case "keep_deadline":
      return `Giữ hạn ${dmy(plan.targetDate)}, góp ${monthly}.`;
    case "extend_deadline":
      return plan.needed
        ? `Lùi hạn đến ${dmy(plan.targetDate)} (${plan.months} tháng), góp ${monthly}.`
        : `Không cần lùi hạn, vẫn góp ${monthly}.`;
    case "reduce_amount":
      return plan.needed
        ? `Giảm mục tiêu còn ${formatGoalMoney(plan.targetAmount)}, góp ${monthly}.`
        : `Không cần giảm số tiền, vẫn góp ${monthly}.`;
  }
}

const CUT_NOTE: Record<PlanCut["reason"], string> = {
  spike: " (đang tăng so với tháng trước)",
  subscription: " (thuê bao mới)",
  category: "",
};

export function cutSentence(cut: PlanCut): string {
  return `Giảm chi ${cut.label ?? "nhóm này"} ${perMonth(cut.perMonth)}${CUT_NOTE[cut.reason]}`;
}

/** Sentence under the sliders: what the current position means. Fixed templates, instant. */
export function sliderSentence(a: Analysis, targetDate: string, targetAmount: number): string {
  const head = `Với ${formatGoalMoney(targetAmount)} đến ${dmy(targetDate)}, cần góp ${perMonth(a.requiredMonthly)}`;
  switch (a.verdict) {
    case "feasible":
      return `${head}: khả thi.`;
    case "stretch":
      return `${head}: làm được nhưng khá sát phần dư.`;
    case "not_feasible":
      return `${head}: vượt phần dư hiện tại.`;
    case "unknown":
      return `${head}.`;
  }
}

/** Coach line shown in the transcript after an edit was applied (numbers come from the agent's adjustment). */
export function adjustAck(adj: CoachAdjustment): string {
  switch (adj.kind) {
    case "extend_months":
      return `Mình đã lùi hạn thêm ${adj.value} tháng và tính lại cho bạn.`;
    case "reduce_amount_to":
      return `Mình đã giảm mục tiêu còn ${formatGoalMoney(adj.value)} và tính lại cho bạn.`;
    case "raise_saving_to":
      return `Mình đã tính lại theo mức góp ${perMonth(adj.value)}.`;
    case "use_savings_amount":
      return `Mình đã tính ${formatGoalMoney(adj.value)} từ tiền tiết kiệm vào số đã có và tính lại cho bạn.`;
  }
}

const ROUND_STEP = 5_000_000;

/** Quick edit sentences the agent reads without a model: "Lùi 6 tháng", "Giảm 100 triệu". */
export function followUpChips(d: AnalyzeDraft): string[] {
  const chips = ["Lùi 6 tháng"];
  const cut = Math.round((d.targetAmount * 0.1) / ROUND_STEP) * ROUND_STEP;
  if (cut > 0 && d.targetAmount - cut > d.openingAmount) chips.push(`Giảm ${formatGoalMoney(cut)}`);
  return chips;
}
