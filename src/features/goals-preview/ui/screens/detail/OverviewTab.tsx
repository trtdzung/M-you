"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, CalendarCheck, LineChart, PartyPopper } from "lucide-react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { addDays, daysBetween, formatISODate, assetValue } from "../../../engine";
import { cn } from "@/lib/cn";
import { usePreview } from "../../../store/PreviewStore";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { SummaryRows } from "../../shared/SummaryRows";
import { card, infoBox, primaryButton, ring, secondaryButton, sectionTitle, successBox, warningBox } from "../../shared/styles";
import { canTransact, type GoalContext } from "./common";

interface TimelineItem {
  date: string;
  label: string;
  done: boolean;
  note?: string;
}

function buildTimeline({ state, goal, pct }: GoalContext): TimelineItem[] {
  const today = state.clock.today;
  const items: TimelineItem[] = [{ date: goal.createdAt, label: "Tạo mục tiêu", done: true }];
  const span = daysBetween(goal.createdAt, goal.targetDate);
  for (const m of [25, 50, 75]) {
    const planned = addDays(goal.createdAt, Math.round((span * m) / 100));
    const reached = pct >= m;
    items.push({
      date: planned,
      label: `Mốc ${m}% (${formatVnd((goal.targetAmount * m) / 100)})`,
      done: reached,
      note: reached ? "Đã đạt · chưa có ngày ghi nhận" : "Chưa đạt",
    });
  }
  for (const a of state.assets) {
    if (a.goalId !== goal.id || a.type !== "liquid" || a.status !== "held" || !a.maturityDate) continue;
    items.push({
      date: a.maturityDate,
      label: `Đáo hạn: ${a.name}`,
      done: a.maturityDate <= today,
      note: formatVnd(assetValue(a, state)),
    });
  }
  const loan = state.loans.find((l) => l.id === goal.loanId);
  if (loan) {
    items.push({ date: loan.disbursedAt, label: `Giải ngân khoản vay ${formatVnd(loan.principal)}`, done: loan.disbursedAt <= today });
    const last = loan.schedule[loan.schedule.length - 1];
    if (last) items.push({ date: last.dueDate, label: "Dự kiến trả hết nợ", done: loan.status === "paid_off" });
  }
  items.push({ date: goal.targetDate, label: "Ngày đến hạn mục tiêu", done: goal.targetDate <= today });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

const FE_TEXT: Record<string, { text: string; box: string }> = {
  feasible: { text: "Kế hoạch khả thi với mức dư hiện tại.", box: successBox },
  tight: { text: "Kế hoạch khả thi nhưng khá sát — chiếm phần lớn số dư hằng tháng.", box: warningBox },
  infeasible: { text: "Với mức góp hiện tại, đến hạn bạn sẽ còn thiếu tiền.", box: warningBox },
  unknown: { text: "Chưa đủ dữ liệu thu chi để đánh giá. Cần thêm vài tháng dữ liệu.", box: infoBox },
  reached: { text: "Bạn đã đủ tiền cho mục tiêu này.", box: successBox },
  not_applicable: { text: "", box: infoBox },
};

export function OverviewTab({ ctx, goalId, suggestions }: { ctx: GoalContext; goalId: string; suggestions?: ReactNode }) {
  const { dispatch, nav } = usePreview();
  const { goal, state, fe, required } = ctx;
  const [keepGoing, setKeepGoing] = useState(false);
  const [confirmEarly, setConfirmEarly] = useState(false);
  const today = state.clock.today;
  const due = goal.targetDate <= today;
  const timeline = buildTimeline(ctx);
  const active = canTransact(goal) && goal.status !== "paused";
  const feText = FE_TEXT[fe.status];

  const quick = [
    { label: "Nạp tiền", icon: ArrowDownToLine, show: active, go: () => nav.push("DepositFlow", { goalId }) },
    { label: "Rút tiền", icon: ArrowUpFromLine, show: canTransact(goal), go: () => nav.push("WithdrawFlow", { goalId }) },
    { label: "Đầu tư", icon: LineChart, show: goal.status === "accumulating", go: () => nav.push("InvestSuggest", { goalId }) },
    { label: "Vay", icon: Banknote, show: goal.status === "accumulating" || goal.status === "missed", go: () => nav.push("LoanSimulator", { goalId }) },
  ].filter((q) => q.show);

  let stage: { label: string; screen: "DueResult" | "RepayOverview" | "AchievedIntro" | "MissedOptions" | "CompletedCelebration" } | undefined;
  if (goal.status === "repaying") stage = { label: "Xem khoản vay đang trả", screen: "RepayOverview" };
  else if (goal.status === "achieved") stage = { label: "Bắt đầu giai đoạn trả nợ", screen: "AchievedIntro" };
  else if (goal.status === "missed") stage = { label: "Chọn cách đi tiếp", screen: "MissedOptions" };
  else if (goal.status === "completed") stage = { label: "Xem chúc mừng", screen: "CompletedCelebration" };
  else if (due && goal.status === "accumulating") stage = { label: "Xem kết quả đến hạn", screen: "DueResult" };

  return (
    <div className="flex flex-col gap-4">
      {goal.reachedEarlyAt && goal.status === "accumulating" && !keepGoing && (
        <section className={`${successBox} flex flex-col gap-3`}>
          <p className="flex items-center gap-2 font-semibold">
            <PartyPopper size={18} aria-hidden /> Bạn đã đủ tiền trước hạn
          </p>
          <p className="text-[13px] text-muted">
            Đủ ngày {formatISODate(goal.reachedEarlyAt)}, sớm hơn hạn {formatISODate(goal.targetDate)}. Bạn có thể hoàn thành ngay hoặc
            tiếp tục tích luỹ đến hạn.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cn(primaryButton, "flex-1")} onClick={() => setConfirmEarly(true)}>
              Hoàn thành sớm
            </button>
            <button type="button" className={cn(secondaryButton, "flex-1")} onClick={() => setKeepGoing(true)}>
              Tiếp tục tích luỹ
            </button>
          </div>
        </section>
      )}

      {quick.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={q.go}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-semibold shadow-card ${q.label === "Nạp tiền" ? "bg-primary text-primary-fg" : "bg-surface text-text"} ${ring}`}
            >
              <q.icon size={20} aria-hidden className={q.label === "Nạp tiền" ? "text-primary-fg" : "text-primary-strong"} />
              {q.label}
            </button>
          ))}
        </div>
      )}
      {stage && (
        <button type="button" className={primaryButton} onClick={() => nav.push(stage.screen, { goalId })}>
          <CalendarCheck size={18} aria-hidden /> {stage.label}
        </button>
      )}

      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={sectionTitle}>Kế hoạch góp</h2>
          {feText.text && <InfoTooltip warning={fe.status === "tight" || fe.status === "infeasible"} label="đánh giá kế hoạch góp" text={feText.text} />}
        </div>
        {goal.status === "accumulating" || goal.status === "paused" || goal.status === "missed" ? <>
          <div>
            <p className="text-[13px] text-muted">Cần góp mỗi tháng · còn {fe.monthsLeft} tháng</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums text-text">{typeof required === "number" ? formatVnd(required) : "Chưa đủ dữ liệu"}</p>
          </div>
          <dl className="flex flex-col gap-3 border-t border-border pt-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Đã đặt trích tự động</dt><dd className="font-semibold text-text">{goal.standingOrder?.active ? `${formatVnd(goal.standingOrder.amount)}/tháng` : "Chưa bật"}</dd></div>
            {typeof required === "number" && <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Cần góp thêm mỗi tháng</dt><dd className="font-semibold text-text">{formatVnd(Math.max(0, required - (goal.standingOrder?.active ? goal.standingOrder.amount : 0)))}</dd></div>}
          </dl>
          {canTransact(goal) && <button type="button" className={secondaryButton} onClick={() => nav.push("StandingOrderManage", { goalId })}>{goal.standingOrder?.active ? "Điều chỉnh trích tự động" : "Thiết lập trích tự động"}</button>}
          <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-primary-strong">Chi tiết kế hoạch</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-[12px] leading-5 text-muted">Các số dự kiến dùng mức phân bổ từ số dư hằng tháng, chưa phải khoản trích tự động đã thiết lập.</p>
              <SummaryRows rows={[
                { label: "Mức phân bổ dự kiến mỗi tháng", value: fe.allocatedMonthly === "unknown" ? "Chưa đủ dữ liệu" : fe.allocatedMonthly, source: "estimated" },
                { label: "Giá trị dự kiến khi đến hạn", value: fe.projectedAtTarget === "unknown" ? "Chưa đủ dữ liệu" : fe.projectedAtTarget, source: "estimated" },
              ]} />
            </div>
          </details>
        </> : <p className="text-sm text-muted">Mục tiêu không còn cần góp thêm theo kế hoạch ở trạng thái này.</p>}
        {fe.status === "infeasible" && goal.status === "accumulating" && (
          <button type="button" className={secondaryButton} onClick={() => nav.push("LoanSimulator", { goalId })}>
            Xem các cách bù phần thiếu
          </button>
        )}
      </section>

      {suggestions}

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className={sectionTitle}>Lộ trình</h2>
        <ol className="flex flex-col">
          {timeline.map((t, i) => (
            <li key={`${t.date}-${t.label}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", t.done ? "bg-positive" : "border-2 border-border bg-surface")} />
                {i < timeline.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="pb-4">
                <p className={cn("text-sm", t.done ? "font-semibold text-text" : "text-muted")}>{t.label}</p>
                <p className="text-[12px] text-muted">
                  {t.label.startsWith("Mốc ") ? "Kế hoạch: " : ""}{formatISODate(t.date)}
                  {t.note ? ` · ${t.note}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <ConfirmSheet
        open={confirmEarly}
        title="Hoàn thành mục tiêu sớm?"
        rows={[
          { label: "Mục tiêu", value: goal.name },
          { label: "Giá trị hiện có", value: ctx.value.total, source: ctx.value.source, emphasis: true },
          { label: "Trích tự động", value: "Sẽ tắt" },
        ]}
        note="Mục tiêu chuyển sang Hoàn thành. Tiền vẫn nằm trong tài khoản mục tiêu."
        confirmLabel="Hoàn thành mục tiêu"
        onConfirm={() => {
          dispatch({ type: "completeEarly", goalId });
          nav.push("CompletedCelebration", { goalId });
        }}
        onClose={() => setConfirmEarly(false)}
      />
    </div>
  );
}
