"use client";

import { useState } from "react";
import { MoreVertical, Pause, Play, XCircle } from "lucide-react";
import { Sheet, SegmentedControl } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { daysToTarget, formatISODate, phaseOf } from "../../../engine";
import { agentCardsFor } from "./agentCards";
import { TEMPLATE_EMOJI, TEMPLATE_LABEL } from "../../../model/labels";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { Amount } from "../../shared/Amount";
import { GoalStatusBadge, ProgressStateBadge } from "../../shared/GoalStatusBadge";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { card, listRow, ring } from "../../shared/styles";
import { AssetsTab } from "./AssetsTab";
import { CashTab } from "./CashTab";
import { GoalNotFound, useGoalContext } from "./common";
import { OverviewTab } from "./OverviewTab";

type Tab = "overview" | "cash" | "assets";

function parseTab(raw: string | undefined): Tab {
  const t = (raw ?? "").toLowerCase();
  if (t === "cash" || t === "money" || t === "tien") return "cash";
  if (t === "assets" || t === "asset" || t === "tai-san") return "assets";
  return "overview";
}

/** Chi tiết mục tiêu. */
export function GoalDetail({ params }: ScreenProps) {
  const goalId = paramString(params, "goalId");
  const { dispatch, nav, state } = usePreview();
  const ctx = useGoalContext(goalId);
  const [tab, setTab] = useState<Tab>(() => parseTab(paramString(params, "tab")));
  const [menu, setMenu] = useState(false);
  if (!ctx || !goalId) return <GoalNotFound title="Chi tiết mục tiêu" />;

  const { goal } = ctx;
  const days = daysToTarget(goal, state.clock.today);
  const history = goal.status === "completed" || goal.status === "closed";
  const shownTotal = history && goal.finalValue !== undefined ? goal.finalValue : ctx.value.total;
  const pct = Math.round((shownTotal / Math.max(1, goal.targetAmount)) * 100);
  const phase = phaseOf(goal);
  const cards = agentCardsFor(state, goalId);
  const canPause = goal.status === "accumulating" || goal.status === "repaying";
  const canClose = !history;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader
        title={goal.name}
        subtitle={`${TEMPLATE_EMOJI[goal.template]} ${TEMPLATE_LABEL[goal.template]}`}
        right={
          (canPause || goal.status === "paused" || canClose) && (
            <button type="button" aria-label="Tuỳ chọn mục tiêu" onClick={() => setMenu(true)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-surface/80 ${ring}`}>
              <MoreVertical size={22} />
            </button>
          )
        }
      />

      <section className={`${card} flex flex-col gap-3`} aria-label="Tiến độ mục tiêu">
        <div className="flex flex-wrap items-center gap-2">
          <GoalStatusBadge status={goal.status} />
          {(goal.status === "accumulating" || goal.status === "repaying") && <ProgressStateBadge state={ctx.progress} />}
          <span className="ml-auto text-[12px] text-muted">
            {history ? `Hạn ${formatISODate(goal.targetDate)}` : days > 0 ? `Còn ${days} ngày` : days === 0 ? "Đến hạn hôm nay" : `Quá hạn ${-days} ngày`}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <Amount amount={shownTotal} source={ctx.value.source} className="text-[28px] font-bold text-text" />
          <span className="text-sm text-muted">Mục tiêu {formatVnd(goal.targetAmount)}</span>
        </div>
        <SplitProgressBar cash={history ? shownTotal : ctx.value.cash} assets={history ? 0 : ctx.value.assets} target={goal.targetAmount} />
        <p className="text-[12px] text-muted">
          {pct}% mục tiêu · {phase === 1 ? "Giai đoạn 1: tích luỹ" : "Giai đoạn 2: tích luỹ & trả nợ"} · hạn {formatISODate(goal.targetDate)}
        </p>
      </section>

      <SegmentedControl<Tab>
        ariaLabel="Nội dung mục tiêu"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Tổng quan" },
          { value: "cash", label: "Tiền" },
          { value: "assets", label: "Tài sản" },
        ]}
      />

      {tab === "overview" && <OverviewTab ctx={ctx} goalId={goalId} suggestions={cards} />}
      {tab === "cash" && <CashTab ctx={ctx} goalId={goalId} />}
      {tab === "assets" && <AssetsTab ctx={ctx} goalId={goalId} />}

      <Sheet open={menu} title="Tuỳ chọn mục tiêu" onClose={() => setMenu(false)}>
        <ul className="flex flex-col divide-y divide-border">
          {canPause && (
            <li>
              <button
                type="button"
                className={listRow}
                onClick={() => {
                  dispatch({ type: "pauseGoal", goalId });
                  setMenu(false);
                }}
              >
                <Pause size={20} aria-hidden /> Tạm dừng mục tiêu
              </button>
            </li>
          )}
          {goal.status === "paused" && (
            <li>
              <button
                type="button"
                className={listRow}
                onClick={() => {
                  dispatch({ type: "resumeGoal", goalId });
                  setMenu(false);
                }}
              >
                <Play size={20} aria-hidden /> Tiếp tục mục tiêu
              </button>
            </li>
          )}
          {canClose && (
            <li>
              <button
                type="button"
                className={`${listRow} text-negative`}
                onClick={() => {
                  setMenu(false);
                  nav.push("CloseGoalFlow", { goalId });
                }}
              >
                <XCircle size={20} aria-hidden /> Đóng mục tiêu
              </button>
            </li>
          )}
        </ul>
      </Sheet>
    </div>
  );
}
