"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Plus } from "lucide-react";
import { SegmentedControl } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { allocateSurplus, daysToTarget, formatISODate, goalValue, progressPct, progressState } from "../../../engine";
import { TEMPLATE_EMOJI, TEMPLATE_LABEL } from "../../../model/labels";
import type { ScreenProps } from "../../../model/screens";
import type { PreviewState } from "../../../model/state";
import type { Goal } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { selectActiveGoals, selectHistoryGoals } from "../../../store/selectors";
import { Amount } from "../../shared/Amount";
import { EmptyState } from "../../shared/EmptyState";
import { GoalStatusBadge, ProgressStateBadge } from "../../shared/GoalStatusBadge";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { card, chip, chipSelected, infoBox, primaryButton, ring, secondaryButton } from "../../shared/styles";

type Tab = "active" | "history";

function milestoneHint(pct: number, goal: Goal): string {
  const next = [25, 50, 75, 100].find((m) => pct < m);
  if (next === undefined) return "Đã đủ tiền cho mục tiêu";
  const need = Math.max(0, (goal.targetAmount * next) / 100);
  return `Mốc kế tiếp ${next}% (${formatVnd(need)})`;
}

function cardHint(state: PreviewState, goal: Goal, pct: number): string {
  const today = state.clock.today;
  switch (goal.status) {
    case "paused":
      return "Đang tạm dừng — bấm để tiếp tục.";
    case "missed":
      return "Đến hạn nhưng chưa đủ tiền — chọn cách đi tiếp.";
    case "achieved":
      return "Đã đạt mục tiêu bằng khoản vay — bắt đầu trả nợ.";
    case "repaying": {
      const loan = state.loans.find((l) => l.id === goal.loanId);
      const next = loan?.schedule.find((r) => r.status !== "paid");
      return next ? `Kỳ trả nợ kế tiếp ${formatISODate(next.dueDate)}: ${formatVnd(next.payment)}` : "Đang trả nợ khoản vay mục tiêu.";
    }
    case "completed":
      return goal.completedEarly ? `Hoàn thành sớm ngày ${formatISODate(goal.completedAt)}` : `Hoàn thành ngày ${formatISODate(goal.completedAt)}`;
    case "closed":
      return `Đã đóng ngày ${formatISODate(goal.closedAt)}`;
    default: {
      if (goal.reachedEarlyAt) return "Đã đủ tiền trước hạn — bạn có thể hoàn thành sớm.";
      const days = daysToTarget(goal, today);
      return `${milestoneHint(pct, goal)} · ${days > 0 ? `còn ${days} ngày` : "đã đến hạn"}`;
    }
  }
}

function GoalCard({ state, goal, onOpen }: { state: PreviewState; goal: Goal; onOpen: () => void }) {
  const history = goal.status === "completed" || goal.status === "closed";
  const v = goalValue(state, goal);
  const pct = progressPct(state, goal);
  const finished = history && goal.finalValue !== undefined;
  const cash = finished ? goal.finalValue! : v.cash;
  const assets = finished ? 0 : v.assets;
  const showProgress = goal.status === "accumulating" || goal.status === "repaying";
  return (
    <button type="button" onClick={onOpen} className={`${card} flex w-full flex-col gap-3 text-left ${ring}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-[22px]">
          {TEMPLATE_EMOJI[goal.template]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text">{goal.name}</p>
          <p className="text-[12px] text-muted">
            {TEMPLATE_LABEL[goal.template]} · hạn {formatISODate(goal.targetDate)}
          </p>
        </div>
        <GoalStatusBadge status={goal.status} />
      </div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <Amount amount={finished ? goal.finalValue : v.total} source={v.source} className="font-semibold text-text" />
        <span className="text-muted">/ {formatVnd(goal.targetAmount)}</span>
      </div>
      <SplitProgressBar cash={cash} assets={assets} target={goal.targetAmount} showLegend={!history} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] leading-5 text-muted">{cardHint(state, goal, pct)}</p>
        {showProgress && <ProgressStateBadge state={progressState(state, goal)} />}
      </div>
    </button>
  );
}

/** Mục tiêu của tôi. */
export function GoalList({ params }: ScreenProps) {
  void params;
  const { state, dispatch, nav } = usePreview();
  const [tab, setTab] = useState<Tab>("active");
  const [sorting, setSorting] = useState(false);

  const active = useMemo(() => selectActiveGoals(state), [state]);
  const history = useMemo(() => selectHistoryGoals(state), [state]);

  const summary = useMemo(() => {
    const totalValue = active.reduce((sum, g) => sum + goalValue(state, g).total, 0);
    const monthly = active.reduce((sum, g) => sum + (g.standingOrder?.active ? g.standingOrder.amount : 0), 0);
    const surplus = state.customer.monthlySurplus;
    const alloc = allocateSurplus(state);
    let left: number | "unknown" = "unknown";
    if (surplus !== "unknown") {
      const used = Object.values(alloc).reduce<number>((sum, a) => sum + (typeof a === "number" ? a : 0), 0);
      const loans = state.loans.filter((l) => l.status === "active").reduce((s, l) => s + l.monthlyPayment, 0);
      left = Math.max(0, surplus - loans - used);
    }
    return { totalValue, monthly, left };
  }, [active, state]);

  function move(index: number, dir: -1 | 1) {
    const ids = active.map((g) => g.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    dispatch({ type: "reorderPriorities", goalIds: ids });
  }

  const open = (g: Goal) => nav.push("GoalDetail", { goalId: g.id });
  const list = tab === "active" ? active : history;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader
        title="Mục tiêu của tôi"
        right={
          <button
            type="button"
            aria-label="Tạo mục tiêu"
            onClick={() => nav.push("TemplatePick")}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg ${ring}`}
          >
            <Plus size={22} />
          </button>
        }
      />

      {active.length > 0 && (
        <section className={`${card} flex flex-col gap-3`} aria-label="Tổng quan mục tiêu">
          <div>
            <p className="text-[13px] text-muted">Tổng giá trị đang tích luỹ</p>
            <Amount amount={summary.totalValue} source="msb" className="text-[24px] font-bold text-text" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[12px] text-muted">Góp mỗi tháng</p>
              <Amount amount={summary.monthly} source="msb" className="font-semibold text-text" />
            </div>
            <div>
              <p className="text-[12px] text-muted">Mức dư còn lại/tháng</p>
              <Amount
                amount={summary.left}
                source={summary.left === "unknown" ? undefined : "estimated"}
                unknownLabel="chưa đủ dữ liệu"
                className="font-semibold text-text"
              />
            </div>
          </div>
        </section>
      )}

      <SegmentedControl<Tab>
        ariaLabel="Lọc mục tiêu"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setSorting(false);
        }}
        options={[
          { value: "active", label: `Đang thực hiện (${active.length})` },
          { value: "history", label: `Lịch sử (${history.length})` },
        ]}
      />

      {tab === "active" && active.length > 1 && (
        <button type="button" onClick={() => setSorting((s) => !s)} className={sorting ? chipSelected : chip}>
          {sorting ? <Check size={16} className="mr-1.5" /> : <ArrowUpDown size={16} className="mr-1.5" />}
          {sorting ? "Xong" : "Sắp xếp ưu tiên"}
        </button>
      )}
      {sorting && (
        <p className={infoBox}>
          Số dư hằng tháng được chia theo thứ tự ưu tiên: mục tiêu đứng trên được lấp đủ phần cần góp trước, phần còn lại mới chia cho
          mục tiêu bên dưới.
        </p>
      )}

      {list.length === 0 ? (
        tab === "active" ? (
          <EmptyState
            title="Bạn chưa có mục tiêu nào"
            description="Đặt một mục tiêu, M-You sẽ mở tài khoản riêng và gợi ý cách góp đều mỗi tháng."
            ctaLabel="Tạo mục tiêu"
            onCta={() => nav.push("TemplatePick")}
          />
        ) : (
          <EmptyState title="Chưa có mục tiêu nào hoàn thành" description="Các mục tiêu đã hoàn thành hoặc đã đóng sẽ nằm ở đây." />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((g, i) => (
            <li key={g.id} className="flex items-stretch gap-2">
              {sorting && tab === "active" && (
                <div className="flex shrink-0 flex-col justify-center gap-1">
                  <span className="text-center text-[12px] font-semibold text-muted">#{i + 1}</span>
                  <button
                    type="button"
                    aria-label={`Đưa ${g.name} lên`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-40 ${ring}`}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Đưa ${g.name} xuống`}
                    disabled={i === list.length - 1}
                    onClick={() => move(i, 1)}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-40 ${ring}`}
                  >
                    <ArrowDown size={18} />
                  </button>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <GoalCard state={state} goal={g} onOpen={() => open(g)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "active" && active.length > 0 && !sorting && (
        <button type="button" className={secondaryButton} onClick={() => nav.push("TemplatePick")}>
          <Plus size={18} /> Tạo mục tiêu mới
        </button>
      )}
      {tab === "history" && history.length === 0 && (
        <button type="button" className={primaryButton} onClick={() => setTab("active")}>
          Xem mục tiêu đang thực hiện
        </button>
      )}
    </div>
  );
}
