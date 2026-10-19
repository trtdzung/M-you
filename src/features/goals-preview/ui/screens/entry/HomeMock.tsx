"use client";

import { ArrowLeftRight, ChevronRight, CreditCard, Landmark, PiggyBank, Plus, Target, type LucideIcon } from "lucide-react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { AgentSuggestionCard } from "../../../agent-sim/AgentSuggestionCard";
import { visibleSuggestions } from "../../../agent-sim/rules";
import { formatISODate, monthsLeft } from "../../../engine/dates";
import { idleCash } from "../../../engine/invest";
import { requiredMonthly } from "../../../engine/feasibility";
import { goalValue, progressPct, progressState } from "../../../engine/value";
import { STATUS_LABEL, TEMPLATE_EMOJI } from "../../../model/labels";
import type { ScreenProps } from "../../../model/screens";
import type { PreviewState } from "../../../model/state";
import type { Goal } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { selectActiveGoals, selectTopGoal } from "../../../store/selectors";
import { GoalStatusBadge, ProgressStateBadge } from "../../shared/GoalStatusBadge";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { card, divider, ring, sectionTitle, screenPadding } from "../../shared/styles";

/** One line telling the customer what to do next on a goal. */
function nextStep(state: PreviewState, goal: Goal): string {
  switch (goal.status) {
    case "accumulating": {
      const left = monthsLeft(state.clock.today, goal.targetDate);
      const need = requiredMonthly(state, goal);
      if (need <= 0) return `Đã đủ tiền, còn ${left} tháng đến ${formatISODate(goal.targetDate)}.`;
      return `Nạp khoảng ${formatVnd(need)}/tháng, còn ${left} tháng đến ${formatISODate(goal.targetDate)}.`;
    }
    case "achieved":
      return "Đã đạt mục tiêu. Xem lịch trả nợ để bắt đầu.";
    case "repaying": {
      const loan = state.loans.find((l) => l.goalId === goal.id && l.status === "active");
      const row = loan?.schedule.find((r) => r.status !== "paid");
      return row
        ? `Kỳ trả tiếp theo ${formatVnd(row.payment)} vào ${formatISODate(row.dueDate)}.`
        : "Đang trong giai đoạn trả nợ.";
    }
    case "missed":
      return "Đã đến hạn nhưng còn thiếu. Chọn cách xử lý.";
    case "paused":
      return "Đang tạm dừng. Tiếp tục khi bạn sẵn sàng.";
    default:
      return STATUS_LABEL[goal.status];
  }
}

function QuickTile({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface-muted/70 px-1 text-center ${ring}`}>
      <Icon size={22} aria-hidden className="text-primary-strong" />
      <span className="text-[13px] font-medium leading-4 text-text">{label}</span>
    </button>
  );
}

/** Mô phỏng trang chủ ứng dụng ngân hàng, có thẻ mục tiêu và gợi ý của M-You. */
export function HomeMock({ params }: ScreenProps) {
  void params;
  const { state, nav, toast } = usePreview();
  const top = selectTopGoal(state);
  const active = selectActiveGoals(state);
  const suggestions = visibleSuggestions(state).slice(0, 2);
  const outOfScope = () => toast("Tính năng này nằm ngoài phạm vi mô phỏng.", "info");

  const depositGoal = active.find((g) => idleCash(state, g) > 0) ?? active.find((g) => g.status === "accumulating") ?? top;
  const loanGoal = active.find((g) => g.status === "accumulating") ?? top;

  const openAccounts = state.accounts.filter((a) => a.status === "open");

  return (
    <div className={screenPadding}>
      <header className="flex items-center gap-3 py-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-base font-bold text-primary-strong">
          {state.customer.name.trim().split(/\s+/).pop()?.[0] ?? "K"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-5 text-muted">Xin chào</p>
          <h1 className="truncate text-[20px] font-bold leading-6 text-text">{state.customer.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => nav.reset("FlowMap")}
          className={`rounded-full border border-border px-3 text-xs font-semibold leading-8 text-muted ${ring}`}
        >
          Bản đồ luồng
        </button>
      </header>

      <section className={`${card} bg-primary text-primary-fg`} aria-label="Tài khoản chính">
        <p className="text-[13px] opacity-80">Tài khoản thanh toán · {state.customer.mainCasaNumber}</p>
        <p className="mt-1 text-[26px] font-bold leading-8 tabular-nums">{formatVnd(state.customer.mainCasaBalance)}</p>
      </section>

      <section className="flex flex-col gap-2" aria-label="Mục tiêu ưu tiên">
        <div className="flex items-center justify-between">
          <h2 className={sectionTitle}>Mục tiêu của bạn</h2>
          <button type="button" onClick={() => nav.push("GoalList")} className={`-mr-2 min-h-11 px-2 text-sm font-semibold text-primary-strong ${ring}`}>
            Xem tất cả
          </button>
        </div>
        {top ? (
          <button
            type="button"
            onClick={() => nav.push("GoalDetail", { goalId: top.id })}
            className={`${card} flex flex-col gap-3 text-left ${ring}`}
          >
            <div className="flex items-center gap-3">
              <span aria-hidden className="text-2xl">
                {TEMPLATE_EMOJI[top.template]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-text">{top.name}</p>
                <p className="text-[13px] text-muted">
                  {formatVnd(goalValue(state, top).total)} / {formatVnd(top.targetAmount)} · {Math.round(progressPct(state, top))}%
                </p>
              </div>
              {top.status === "accumulating" ? (
                <ProgressStateBadge state={progressState(state, top)} />
              ) : (
                <GoalStatusBadge status={top.status} />
              )}
            </div>
            <SplitProgressBar
              cash={goalValue(state, top).cash}
              assets={goalValue(state, top).assets}
              target={top.targetAmount}
              showLegend={false}
            />
            <p className="text-[13px] leading-5 text-text">
              <span className="font-semibold">Bước tiếp theo: </span>
              {nextStep(state, top)}
            </p>
          </button>
        ) : (
          <button type="button" onClick={() => nav.push("TemplatePick")} className={`${card} flex items-center gap-3 text-left ${ring}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
              <Plus size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-text">Tạo mục tiêu đầu tiên</span>
              <span className="block text-[13px] text-muted">Mua xe, mua nhà, du lịch… mỗi mục tiêu một tài khoản riêng.</span>
            </span>
            <ChevronRight size={18} aria-hidden className="text-muted" />
          </button>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Gợi ý từ M-You">
          {suggestions.map((s) => (
            <AgentSuggestionCard key={s.id} suggestion={s} />
          ))}
        </section>
      )}

      <section className={`${card} grid grid-cols-4 gap-2`} aria-label="Tiện ích nhanh">
        <QuickTile icon={ArrowLeftRight} label="Chuyển tiền" onClick={outOfScope} />
        <QuickTile
          icon={PiggyBank}
          label="Tiền gửi"
          onClick={() => (depositGoal ? nav.push("InvestSuggest", { goalId: depositGoal.id }) : nav.push("GoalList"))}
        />
        <QuickTile
          icon={Landmark}
          label="Vay"
          onClick={() => (loanGoal ? nav.push("LoanSimulator", { goalId: loanGoal.id }) : nav.push("GoalList"))}
        />
        <QuickTile icon={Target} label="Mục tiêu" onClick={() => nav.push("GoalList")} />
      </section>

      <section className="flex flex-col gap-2" aria-label="Tài khoản">
        <h2 className={sectionTitle}>Tài khoản</h2>
        <ul className={`${divider} overflow-hidden rounded-card bg-surface shadow-card`}>
          <li className="flex min-h-14 items-center gap-3 px-4 py-3">
            <CreditCard size={20} aria-hidden className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-text">Tài khoản thanh toán</span>
              <span className="block text-[12px] text-muted">{state.customer.mainCasaNumber}</span>
            </span>
            <span className="text-sm font-semibold tabular-nums text-text">{formatVnd(state.customer.mainCasaBalance)}</span>
          </li>
          {openAccounts.map((a) => {
            const goal = state.goals.find((g) => g.id === a.goalId);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => goal && nav.push("GoalDetail", { goalId: goal.id })}
                  className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted ${ring}`}
                >
                  <Target size={20} aria-hidden className="shrink-0 text-primary-strong" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">Mục tiêu: {goal?.name ?? a.name}</span>
                    <span className="block text-[12px] text-muted">{a.number}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-text">{formatVnd(a.balance)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
