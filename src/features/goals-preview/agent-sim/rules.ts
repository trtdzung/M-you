import { formatVnd } from "@/features/goals-preview/format-money";
import { daysBetween, dayOfMonth, formatISODate, monthsBetween, monthsLeft } from "../engine/dates";
import { goalOptions, isSaving, requiredMonthly, feasibility } from "../engine/feasibility";
import { idleCash, investSuggestions } from "../engine/invest";
import { dueOutcome } from "../engine/lifecycle";
import { goalAccount, goalAssets, goalValue, progressPct, progressState, remainingAmount } from "../engine/value";
import type { AgentSuggestion, PreviewState, SuggestionKind } from "../model/state";
import type { Asset, Goal, LiquidAsset, FixedAsset } from "../model/types";

/**
 * Scripted "M-You gợi ý" rules — NO real AI call. Pure and deterministic:
 * ids are `${ruleKey}:${goalId | "all"}` so `dismissSuggestion` keeps them hidden.
 * Each rule has `build(state, goal, force)`; with `force` it skips the trigger
 * condition (used by the test panel to demo a card on any data).
 */

export interface SuggestionRule {
  key: string;
  kind: SuggestionKind;
  /** Short name shown in the test panel. */
  label: string;
  /** Plain-language trigger condition. */
  when: string;
  /** Higher = more urgent (cards are sorted by this). */
  urgency: number;
  /** Evaluated once per goal (true) or once for the whole customer (false). */
  perGoal: boolean;
  build: (state: PreviewState, goal: Goal | undefined, force: boolean) => AgentSuggestion | null;
}

const MILLION = 1_000_000;

function make(
  rule: Pick<SuggestionRule, "key" | "kind">,
  goal: Goal | undefined,
  s: Omit<AgentSuggestion, "id" | "kind" | "goalId">,
): AgentSuggestion {
  const id = `${rule.key}:${goal?.id ?? "all"}`;
  return {
    id,
    kind: rule.kind,
    goalId: goal?.id,
    ...s,
    actions: s.actions.map((a, i) => ({ ...a, primary: a.primary ?? i === 0 })),
  };
}

const later = (id: string, label = "Để sau") => ({ label, action: { type: "dismissSuggestion", id } as const, primary: false });

function liquidAssets(s: PreviewState, goal: Goal): LiquidAsset[] {
  return goalAssets(s, goal.id).filter((a): a is LiquidAsset => a.type === "liquid");
}
function fixedAssets(s: PreviewState, goal: Goal): FixedAsset[] {
  return goalAssets(s, goal.id).filter((a): a is FixedAsset => a.type === "fixed");
}
const holding = (a: Asset) => a.status === "held";

// ------------------------------------------------------------------ rules

const overdue: SuggestionRule = {
  key: "overdue",
  kind: "overdue",
  label: "Kỳ trả nợ quá hạn",
  when: "Đang trả nợ và có kỳ trả đã quá hạn",
  urgency: 100,
  perGoal: true,
  build(s, goal, force) {
    if (!goal) return null;
    const loan = s.loans.find((l) => l.goalId === goal.id && l.status === "active");
    const rows = loan?.schedule.filter((r) => r.status === "overdue") ?? [];
    if (!loan || (rows.length === 0 && !force)) return null;
    const total = rows.reduce((sum, r) => sum + r.payment, 0) || loan.monthlyPayment;
    return make(this, goal, {
      title: `Có ${rows.length || 1} kỳ trả nợ quá hạn`,
      body: `Kỳ trả của “${goal.name}” (${formatVnd(total)}) chưa được thanh toán. Trả sớm để tránh phát sinh lãi phạt và ảnh hưởng hồ sơ tín dụng.`,
      tone: "warning",
      actions: [{ label: "Xem và trả nợ", nav: { screen: "RepayOverview", params: { goalId: goal.id } } }],
    });
  },
};

const missed: SuggestionRule = {
  key: "missed",
  kind: "missed",
  label: "Đến hạn nhưng chưa đủ",
  when: "Mục tiêu có trạng thái “Chưa đạt”",
  urgency: 95,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || (goal.status !== "missed" && !force)) return null;
    const gap = remainingAmount(s, goal);
    return make(this, goal, {
      title: "Mục tiêu đã đến hạn nhưng còn thiếu",
      body: `“${goal.name}” còn thiếu ${formatVnd(gap)}. Bạn có thể lùi ngày, giảm số tiền hoặc vay phần thiếu. Mình đã chuẩn bị sẵn các phương án.`,
      tone: "warning",
      actions: [
        { label: "Xem phương án", nav: { screen: "MissedOptions", params: { goalId: goal.id } } },
        { label: "Thử vay", nav: { screen: "LoanSimulator", params: { goalId: goal.id } } },
      ],
    });
  },
};

const standingOrderFailed: SuggestionRule = {
  key: "standing_order_failed",
  kind: "standing_order_failed",
  label: "Trích định kỳ thất bại",
  when: "Lần trích tự động gần nhất không thành công",
  urgency: 90,
  perGoal: true,
  build(s, goal, force) {
    const so = goal?.standingOrder;
    if (!goal || !so) return null;
    if (!force && !(so.lastResult === "failed" && isSaving(goal))) return null;
    return make(this, goal, {
      title: "Lần trích tự động không thành công",
      body: `Tài khoản chính chưa đủ ${formatVnd(so.amount)} để trích vào “${goal.name}”. Bạn nạp bù hoặc đổi ngày trích sau ngày nhận lương (ngày ${s.customer.salaryDay}) nhé.`,
      tone: "warning",
      actions: [
        { label: "Xử lý ngay", nav: { screen: "StandingOrderManage", params: { goalId: goal.id } } },
        { label: "Nạp bù", nav: { screen: "DepositFlow", params: { goalId: goal.id, amount: so.amount } } },
      ],
    });
  },
};

const achieved: SuggestionRule = {
  key: "achieved",
  kind: "generic",
  label: "Đạt mục tiêu bằng vay",
  when: "Mục tiêu ở trạng thái “Đạt mục tiêu”, chưa bắt đầu trả nợ",
  urgency: 88,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || (goal.status !== "achieved" && !force)) return null;
    return make(this, goal, {
      title: "Chúc mừng, bạn đã đạt mục tiêu",
      body: `“${goal.name}” đã được giải ngân. Giờ bạn chuyển sang giai đoạn tích luỹ và trả nợ. Xem lịch trả để chủ động tiền mỗi tháng.`,
      tone: "success",
      actions: [{ label: "Xem tiếp theo", nav: { screen: "AchievedIntro", params: { goalId: goal.id } } }],
    });
  },
};

const dueSoon: SuggestionRule = {
  key: "due_soon",
  kind: "due_soon",
  label: "Sắp đến hạn mà còn thiếu",
  when: "Còn ≤ 30 ngày đến hạn và giá trị mục tiêu chưa đủ",
  urgency: 85,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || goal.status !== "accumulating") return null;
    const days = daysBetween(s.clock.today, goal.targetDate);
    const short = dueOutcome(s, goal) === "short";
    if (!force && !(days > 0 && days <= 30 && short)) return null;
    const gap = remainingAmount(s, goal);
    return make(this, goal, {
      title: `Còn ${Math.max(days, 0)} ngày là đến hạn`,
      body: `“${goal.name}” còn thiếu ${formatVnd(gap)}. Bạn có thể vay phần thiếu hoặc gia hạn thêm thời gian, không cần chờ đến sát ngày.`,
      tone: "warning",
      actions: [
        { label: "Xem phương án vay", nav: { screen: "LoanSimulator", params: { goalId: goal.id } } },
        { label: "Gia hạn / giảm mục tiêu", nav: { screen: "DueResult", params: { goalId: goal.id } } },
      ],
    });
  },
};

const maturity: SuggestionRule = {
  key: "maturity",
  kind: "maturity",
  label: "Tiền gửi đáo hạn",
  when: "Tiền gửi đã đáo hạn hoặc đáo hạn trong 14 ngày",
  urgency: 80,
  perGoal: true,
  build(s, goal, force) {
    if (!goal) return null;
    const deposits = liquidAssets(s, goal).filter((a) => a.category === "term_deposit" && a.maturityDate);
    const hit =
      deposits.find((a) => a.status === "matured") ??
      deposits.find((a) => holding(a) && daysBetween(s.clock.today, a.maturityDate!) <= 14) ??
      (force ? deposits[0] : undefined);
    if (!hit) return null;
    const matured = hit.status === "matured" || daysBetween(s.clock.today, hit.maturityDate!) <= 0;
    const days = daysBetween(s.clock.today, hit.maturityDate!);
    return make(this, goal, {
      title: matured ? "Tiền gửi đã đáo hạn" : `Tiền gửi đáo hạn sau ${days} ngày`,
      body: matured
        ? `“${hit.name}” đã đáo hạn, khoảng ${formatVnd(hit.value)} đang chờ bạn chọn: tái tục để tiếp tục sinh lãi hoặc đưa về tài khoản mục tiêu.`
        : `“${hit.name}” đáo hạn ngày ${formatISODate(hit.maturityDate)}. Bạn có thể chọn trước: tái tục hay nhận tiền về.`,
      tone: matured ? "info" : "info",
      actions: [
        { label: "Chọn cách xử lý", nav: { screen: "MaturityChoice", params: { goalId: goal.id, assetId: hit.id } } },
        later(`${this.key}:${goal.id}`),
      ],
    });
  },
};

const fundDrop: SuggestionRule = {
  key: "fund_drop",
  kind: "fund_drop",
  label: "Giá quỹ giảm, gần đích",
  when: "Chứng chỉ quỹ giảm ≥ 5% so với giá vốn và mục tiêu còn ≤ 12 tháng (hoặc đã đạt ≥ 70%)",
  urgency: 70,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || !isSaving(goal)) return null;
    const funds = liquidAssets(s, goal).filter((a) => a.category === "fund" && holding(a));
    const dropOf = (a: LiquidAsset) => (a.costBasis > 0 ? ((a.costBasis - a.value) / a.costBasis) * 100 : 0);
    const hit = funds.find((a) => dropOf(a) >= 5) ?? (force ? funds[0] : undefined);
    if (!hit) return null;
    const near = monthsLeft(s.clock.today, goal.targetDate) <= 12 || progressPct(s, goal) >= 70;
    if (!force && !near) return null;
    const drop = Math.max(0, Math.round(dropOf(hit)));
    return make(this, goal, {
      title: "Giá quỹ đang giảm, mục tiêu đã gần",
      body: `“${hit.name}” thấp hơn giá vốn khoảng ${drop}%, trong khi “${goal.name}” còn ${monthsLeft(s.clock.today, goal.targetDate)} tháng. Bạn có thể chuyển một phần sang tiền gửi an toàn để giữ phần đã có.`,
      tone: "warning",
      actions: [
        { label: "Xem tài sản", nav: { screen: "LiquidAssetDetail", params: { goalId: goal.id, assetId: hit.id } } },
        later(`${this.key}:${goal.id}`, "Giữ nguyên"),
      ],
    });
  },
};

const earlyAchieved: SuggestionRule = {
  key: "early_achieved",
  kind: "early_achieved",
  label: "Đủ tiền trước hạn",
  when: "Giá trị mục tiêu đã đạt số tiền cần trước ngày đến hạn",
  urgency: 65,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || goal.status !== "accumulating") return null;
    if (!force && !goal.reachedEarlyAt) return null;
    return make(this, goal, {
      title: "Bạn đã đủ tiền trước hạn",
      body: `“${goal.name}” đã đạt ${formatVnd(goalValue(s, goal).total)} / ${formatVnd(goal.targetAmount)}, sớm hơn kế hoạch (${formatISODate(goal.targetDate)}). Bạn có thể hoàn thành ngay hoặc để tiền sinh lãi thêm.`,
      tone: "success",
      actions: [
        { label: "Hoàn thành mục tiêu", nav: { screen: "GoalDetail", params: { goalId: goal.id } } },
        later(`${this.key}:${goal.id}`),
      ],
    });
  },
};

const behindPlan: SuggestionRule = {
  key: "behind_plan",
  kind: "behind_plan",
  label: "Chậm kế hoạch",
  when: "Đang hơi chậm / lệch kế hoạch và mục tiêu đã tạo ≥ 2 tháng",
  urgency: 60,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || goal.status !== "accumulating") return null;
    const state = progressState(s, goal);
    const behind = state === "slightly_behind" || state === "off_track";
    if (!force && !(behind && monthsBetween(goal.createdAt, s.clock.today) >= 2)) return null;
    const required = requiredMonthly(s, goal);
    return make(this, goal, {
      title: "Bạn đang chậm so với kế hoạch",
      body: `Để kịp ${formatISODate(goal.targetDate)}, “${goal.name}” cần thêm khoảng ${formatVnd(required)}/tháng. Có vài cách điều chỉnh nhẹ nhàng, bạn xem thử nhé.`,
      tone: "warning",
      actions: [
        { label: "Xem cách điều chỉnh", nav: { screen: "OptionsCompare", params: { goalId: goal.id } } },
        { label: "Chi tiết mục tiêu", nav: { screen: "GoalDetail", params: { goalId: goal.id } } },
      ],
    });
  },
};

const loanBlocked: SuggestionRule = {
  key: "loan_blocked",
  kind: "loan_blocked",
  label: "Vay vượt khả năng trả",
  when: "Mục tiêu không kịp và khoản vay phần thiếu vượt 40% thu nhập",
  urgency: 58,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || goal.status !== "accumulating") return null;
    const f = feasibility(s, goal);
    const loan = goalOptions(s, goal).loan;
    const blocked = !!loan && !loan.affordability.allowed;
    if (!force && !(blocked && (f.status === "infeasible" || dueOutcome(s, goal) === "short"))) return null;
    const pay = loan ? formatVnd(loan.monthlyPayment) : "mức trả hằng tháng";
    return make(this, goal, {
      title: "Khoản vay phần thiếu đang quá sức",
      body: `Vay phần thiếu của “${goal.name}” cần trả khoảng ${pay}/tháng, vượt giới hạn 40% thu nhập. Lùi ngày hoặc giảm số tiền sẽ nhẹ hơn.`,
      tone: "warning",
      actions: [
        { label: "Xem vì sao", nav: { screen: "LoanBlocked", params: { goalId: goal.id } } },
        { label: "Điều chỉnh mục tiêu", nav: { screen: "OptionsCompare", params: { goalId: goal.id } } },
      ],
    });
  },
};

const salary: SuggestionRule = {
  key: "salary",
  kind: "generic",
  label: "Lương về",
  when: "Trong 3 ngày sau ngày nhận lương, tài khoản chính đủ tiền và chưa bật trích tự động",
  urgency: 55,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || goal.status !== "accumulating") return null;
    const top = s.goals.filter((g) => g.status === "accumulating").sort((a, b) => a.priority - b.priority)[0];
    const sinceSalary = (dayOfMonth(s.clock.today) - s.customer.salaryDay + 31) % 31;
    const required = requiredMonthly(s, goal);
    const amount = Math.max(MILLION, Math.min(required, s.customer.mainCasaBalance));
    const ok =
      top?.id === goal.id &&
      sinceSalary <= 3 &&
      !goal.standingOrder?.active &&
      required > 0 &&
      s.customer.mainCasaBalance >= required;
    if (!force && !ok) return null;
    return make(this, goal, {
      title: "Lương đã về, nạp cho mục tiêu nhé",
      body: `Tài khoản chính đang có ${formatVnd(s.customer.mainCasaBalance)}. Nạp ${formatVnd(amount)} vào “${goal.name}” để theo kịp kế hoạch tháng này.`,
      tone: "info",
      actions: [
        { label: `Nạp ${formatVnd(amount)}`, nav: { screen: "DepositFlow", params: { goalId: goal.id, amount } } },
        later(`${this.key}:${goal.id}`),
      ],
    });
  },
};

const idleCashRule: SuggestionRule = {
  key: "idle_cash",
  kind: "idle_cash",
  label: "Tiền nhàn rỗi",
  when: "Tài khoản mục tiêu có ≥ 10 triệu vượt phần dự phòng",
  urgency: 50,
  perGoal: true,
  build(s, goal, force) {
    if (!goal) return null;
    const idle = idleCash(s, goal);
    const amount = idle || (force ? Math.max(10 * MILLION, goalAccount(s, goal)?.balance ?? 0) : 0);
    if (!amount) return null;
    const best = investSuggestions(s, goal, amount)[0];
    const detail = best
      ? ` Gợi ý: ${best.title}${best.ratePa ? `, lãi ${best.ratePa}%/năm` : ""}${best.estimatedAtMaturity ? `, dự kiến nhận ${formatVnd(best.estimatedAtMaturity)} khi đáo hạn` : ""}.`
      : "";
    return make(this, goal, {
      title: `${formatVnd(amount)} đang nằm yên`,
      body: `Khoản này trong “${goal.name}” chỉ hưởng lãi không kỳ hạn thấp.${detail}`,
      tone: "info",
      actions: [
        { label: "Xem gợi ý đầu tư", nav: { screen: "InvestSuggest", params: { goalId: goal.id } } },
        later(`${this.key}:${goal.id}`),
      ],
    });
  },
};

const prepay: SuggestionRule = {
  key: "prepay",
  kind: "prepay",
  label: "Trả nợ trước hạn",
  when: "Đang trả nợ, tài khoản mục tiêu còn dư ≥ 5 triệu sau kỳ tới và không có kỳ quá hạn",
  urgency: 45,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || goal.status !== "repaying") return null;
    const loan = s.loans.find((l) => l.goalId === goal.id && l.status === "active");
    if (!loan) return null;
    const next = loan.schedule.find((r) => r.status !== "paid");
    const balance = goalAccount(s, goal)?.balance ?? 0;
    const spare = Math.floor((balance - (next?.payment ?? 0) - 2 * MILLION) / MILLION) * MILLION;
    const hasOverdue = loan.schedule.some((r) => r.status === "overdue");
    if (!force && (spare < 5 * MILLION || hasOverdue)) return null;
    const amount = Math.max(spare, 5 * MILLION);
    return make(this, goal, {
      title: "Có tiền dư, trả trước để bớt lãi",
      body: `Sau kỳ trả tới, “${goal.name}” còn dư khoảng ${formatVnd(amount)}. Trả trước khoản này giúp giảm tổng lãi và rút ngắn thời gian vay.`,
      tone: "success",
      actions: [
        { label: "Xem trả trước", nav: { screen: "Prepay", params: { goalId: goal.id, loanId: loan.id, amount } } },
        later(`${this.key}:${goal.id}`),
      ],
    });
  },
};

const revalue: SuggestionRule = {
  key: "revalue_asset",
  kind: "revalue_asset",
  label: "Định giá tài sản đã cũ",
  when: "Tài sản cố định được định giá cách đây hơn 6 tháng",
  urgency: 40,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || !isSaving(goal)) return null;
    const stale = fixedAssets(s, goal).filter(holding);
    const hit = stale.find((a) => daysBetween(a.valuationDate, s.clock.today) > 180) ?? (force ? stale[0] : undefined);
    if (!hit) return null;
    const months = Math.max(1, Math.floor(daysBetween(hit.valuationDate, s.clock.today) / 30));
    return make(this, goal, {
      title: "Cập nhật giá trị tài sản",
      body: `“${hit.name}” được định giá lần cuối cách đây ${months} tháng (${formatVnd(hit.value)}). Giá có thể đã đổi, cập nhật để tiến độ “${goal.name}” chính xác hơn.`,
      tone: "info",
      actions: [
        { label: "Định giá lại", nav: { screen: "RevalueAsset", params: { goalId: goal.id, assetId: hit.id } } },
        later(`${this.key}:${goal.id}`),
      ],
    });
  },
};

const priorityConflict: SuggestionRule = {
  key: "priority_conflict",
  kind: "priority_conflict",
  label: "Nhiều mục tiêu vượt mức dư",
  when: "Từ 2 mục tiêu đang tích luỹ và tổng số cần/tháng lớn hơn số dư hằng tháng",
  urgency: 35,
  perGoal: false,
  build(s, _goal, force) {
    const saving = s.goals.filter(isSaving);
    const surplus = s.customer.monthlySurplus;
    const need = saving.reduce((sum, g) => sum + requiredMonthly(s, g), 0);
    const hit = saving.length >= 2 && surplus !== "unknown" && need > surplus;
    if (!force && !hit) return null;
    const surplusText = surplus === "unknown" ? "chưa rõ" : formatVnd(surplus);
    return make(this, undefined, {
      title: "Các mục tiêu đang tranh nhau số dư",
      body: `${saving.length} mục tiêu cần tổng ${formatVnd(need)}/tháng, trong khi số dư hằng tháng của bạn là ${surplusText}. Hãy sắp xếp thứ tự ưu tiên, mục tiêu quan trọng nhất sẽ được chia trước.`,
      tone: "warning",
      actions: [
        { label: "Sắp xếp ưu tiên", nav: { screen: "GoalList", params: { tab: "active" } } },
        later("priority_conflict:all"),
      ],
    });
  },
};

const completedNext: SuggestionRule = {
  key: "completed_next",
  kind: "generic",
  label: "Vừa hoàn thành mục tiêu",
  when: "Có mục tiêu hoàn thành trong 21 ngày gần đây",
  urgency: 30,
  perGoal: true,
  build(s, goal, force) {
    if (!goal || goal.status !== "completed") return null;
    const recent = !!goal.completedAt && daysBetween(goal.completedAt, s.clock.today) <= 21;
    if (!force && !recent) return null;
    return make(this, goal, {
      title: "Chúc mừng bạn đã hoàn thành",
      body: `“${goal.name}” xong rồi. Khoản bạn vẫn dành mỗi tháng có thể chuyển sang mục tiêu kế tiếp, ví dụ quỹ dự phòng hoặc một chuyến đi.`,
      tone: "success",
      actions: [
        { label: "Chọn mục tiêu tiếp", nav: { screen: "TemplatePick" } },
        { label: "Xem thành quả", nav: { screen: "CompletedCelebration", params: { goalId: goal.id } } },
      ],
    });
  },
};

const insufficientData: SuggestionRule = {
  key: "insufficient_data",
  kind: "insufficient_data",
  label: "Khách mới, chưa đủ dữ liệu",
  when: "Số dư hằng tháng chưa xác định (dữ liệu giao dịch quá ít)",
  urgency: 25,
  perGoal: false,
  build(s, _goal, force) {
    if (s.customer.monthlySurplus !== "unknown" && !force) return null;
    return make(this, undefined, {
      title: "Mình chưa đủ dữ liệu để tính giúp bạn",
      body: `App mới có ${s.customer.dataMonths} tháng giao dịch của bạn, chưa đủ để ước tính số dư hằng tháng. Bạn vẫn tạo mục tiêu được, mình sẽ không đưa ra số ước tính khi chưa chắc.`,
      tone: "info",
      actions: [
        { label: "Tạo mục tiêu", nav: { screen: "TemplatePick" } },
        {
          label: "Vì sao chưa có số liệu?",
          action: {
            type: "toast/push",
            message: "Cần khoảng 3 tháng giao dịch để ước tính thu chi. Trong lúc chờ, bạn tự nhập số tiền muốn tiết kiệm.",
          },
        },
      ],
    });
  },
};

export const SUGGESTION_RULES: SuggestionRule[] = [
  overdue,
  missed,
  standingOrderFailed,
  achieved,
  dueSoon,
  maturity,
  fundDrop,
  earlyAchieved,
  behindPlan,
  loanBlocked,
  salary,
  idleCashRule,
  prepay,
  revalue,
  priorityConflict,
  completedNext,
  insufficientData,
];

// ------------------------------------------------------------------ evaluation

export interface FiredSuggestion {
  rule: SuggestionRule;
  suggestion: AgentSuggestion;
}

function candidateGoals(state: PreviewState): Goal[] {
  return state.goals.filter((g) => g.status !== "draft");
}

/** Every suggestion whose condition holds now, with the rule that fired, most urgent first. */
export function firedSuggestions(state: PreviewState): FiredSuggestion[] {
  const out: FiredSuggestion[] = [];
  for (const rule of SUGGESTION_RULES) {
    if (rule.perGoal) {
      for (const goal of candidateGoals(state)) {
        const suggestion = rule.build(state, goal, false);
        if (suggestion) out.push({ rule, suggestion });
      }
    } else {
      const suggestion = rule.build(state, undefined, false);
      if (suggestion) out.push({ rule, suggestion });
    }
  }
  return out.sort((a, b) => b.rule.urgency - a.rule.urgency);
}

export function getSuggestions(state: PreviewState): AgentSuggestion[] {
  return firedSuggestions(state).map((f) => f.suggestion);
}

/** Suggestions not dismissed, optionally for one goal. */
export function visibleSuggestions(state: PreviewState, goalId?: string): AgentSuggestion[] {
  return getSuggestions(state).filter(
    (s) => !state.dismissedSuggestionIds.includes(s.id) && (goalId === undefined || s.goalId === goalId),
  );
}

/** Rule behind a suggestion id (`ruleKey:goalId`). */
export function ruleOfSuggestion(id: string): SuggestionRule | undefined {
  const key = id.split(":")[0];
  return SUGGESTION_RULES.find((r) => r.key === key);
}

/** Builds a card for `ruleKey` ignoring its trigger condition (test panel demo). Null if the data has nothing to show. */
export function forceSuggestion(state: PreviewState, ruleKey: string, goalId?: string): AgentSuggestion | null {
  const rule = SUGGESTION_RULES.find((r) => r.key === ruleKey);
  if (!rule) return null;
  if (!rule.perGoal) return rule.build(state, undefined, true);
  const goals = candidateGoals(state);
  const goal = goals.find((g) => g.id === goalId) ?? goals[0];
  return goal ? rule.build(state, goal, true) : null;
}
