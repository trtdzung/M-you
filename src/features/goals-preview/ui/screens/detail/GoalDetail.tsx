"use client";

import { useState } from "react";
import { ChevronRight, MoreVertical, Pause, Play, XCircle } from "lucide-react";
import { Sheet, SegmentedControl } from "@/components/primitives";
import { formatVndCompact } from "@/features/goals-preview/format-money";
import { daysToTarget, formatISODate, phaseOf } from "../../../engine";
import { agentCardsFor } from "./agentCards";
import { TEMPLATE_EMOJI, TEMPLATE_LABEL } from "../../../model/labels";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { GoalStatusBadge, ProgressStateBadge } from "../../shared/GoalStatusBadge";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { SummaryRows } from "../../shared/SummaryRows";
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
  const tab = parseTab(paramString(params, "tab"));
  const setTab = (next: Tab) => nav.updateParams({ tab: next });
  const [menu, setMenu] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
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

      <button type="button" aria-label="Xem chi tiết tiến độ mục tiêu" aria-haspopup="dialog" onClick={() => setProgressOpen(true)} className={`${card} flex w-full flex-col gap-3 text-left ${ring}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted">{history ? "Giá trị khi kết thúc" : "Đã tích luỹ"}</span>
          <GoalStatusBadge status={goal.status} />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[28px] font-bold text-text tabular-nums">{formatVndCompact(shownTotal)}</span>
          <span className="text-sm text-muted">/ {formatVndCompact(goal.targetAmount)}</span>
        </div>
        <SplitProgressBar cash={history ? shownTotal : ctx.value.cash} assets={history ? 0 : ctx.value.assets} target={goal.targetAmount} showLegend={false} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-text">{pct}% mục tiêu</span>
          <span className="text-muted">Hạn {formatISODate(goal.targetDate)}</span>
        </div>
        <span className="flex items-center justify-between text-[13px] font-semibold text-primary-strong">Xem chi tiết tiến độ <ChevronRight size={18} aria-hidden /></span>
      </button>

      <Sheet open={progressOpen} title="Chi tiết tiến độ" onClose={() => setProgressOpen(false)}>
        <p className="mb-3 text-sm text-muted">{goal.name} · {phase === 1 ? "Giai đoạn tích luỹ" : "Giai đoạn tích luỹ & trả nợ"}</p>
        <SummaryRows rows={[
          { label: history ? "Giá trị khi kết thúc" : "Tổng giá trị tính vào mục tiêu", value: shownTotal, source: ctx.value.source, emphasis: true },
          { label: "Số tiền mục tiêu", value: goal.targetAmount },
          ...(!history ? [
            { label: "Tiền trong tài khoản mục tiêu", value: ctx.value.cash, source: "msb" as const },
            ...(ctx.value.liquid > 0 ? [{ label: "Tài sản linh hoạt", value: ctx.value.liquid, source: "msb" as const }] : []),
            ...(ctx.value.fixedCounted > 0 ? [{ label: "Tài sản cố định được tính", value: ctx.value.fixedCounted, source: "self_reported" as const, hint: "Giá trị tự khai sau khi áp dụng tỷ lệ tính vào mục tiêu" }] : []),
            { label: "Còn cần tích luỹ", value: Math.max(0, goal.targetAmount - shownTotal) },
          ] : []),
          { label: "Ngày mục tiêu", value: formatISODate(goal.targetDate) },
        ]} />
        {!history && <div className="mt-4 flex flex-wrap items-center gap-2"><ProgressStateBadge state={ctx.progress} /><span className="text-sm text-muted">{days > 0 ? `Còn ${days} ngày` : days === 0 ? "Đến hạn hôm nay" : `Quá hạn ${-days} ngày`}</span></div>}
        {ctx.value.source === "self_reported" && <p className="mt-3 text-sm leading-5 text-muted">Tổng giá trị gồm tiền tại MSB và tài sản tự khai, không phải toàn bộ là tiền có thể rút.</p>}
      </Sheet>

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
