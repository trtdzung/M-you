"use client";

import { useState } from "react";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { addDays, addMonths, formatISODate } from "../../../engine";
import { requiredMonthly } from "../../../engine/feasibility";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { AmountCard, formatShort, SuggestChip } from "../../shared/AmountCard";
import { BottomActions } from "../../shared/BottomActions";
import { DayOfMonthPicker, Switch } from "../../shared/Pickers";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SummaryRows } from "../../shared/SummaryRows";
import { card, fieldError, input, label, primaryButton, secondaryButton, sectionTitle } from "../../shared/styles";
import { GoalNotFound, useGoalContext } from "./common";

const MIN_TARGET = 1_000_000;

/**
 * Chỉnh sửa giá trị mục tiêu, hai bước:
 * 1. nhập giá trị mới · 2. xem lại: số tiền góp hằng tháng được tính lại, khách xác nhận hoặc điều chỉnh.
 */
export function EditTarget({ params }: ScreenProps) {
  const goalId = paramString(params, "goalId");
  const { dispatch, nav } = usePreview();
  const ctx = useGoalContext(goalId);
  const [step, setStep] = useState<"input" | "review">("input");
  const [target, setTarget] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [autoOn, setAutoOn] = useState(true);
  const [day, setDay] = useState<number | null>(null);
  if (!ctx || !goalId) return <GoalNotFound title="Chỉnh sửa giá trị mục tiêu" />;

  const { goal, state } = ctx;
  const so = goal.standingOrder;
  const today = state.clock.today;
  const value = target ?? goal.targetAmount;
  const dateValue = date ?? goal.targetDate;
  const minDate = addDays(today, 1);
  const maxDate = addMonths(today, 360);
  const error = value < MIN_TARGET ? "Số tiền mục tiêu tối thiểu là 1 triệu đồng." : "";
  const dateError = dateValue < minDate ? "Ngày đạt mục tiêu cần sau hôm nay." : dateValue > maxDate ? "Thời hạn tối đa là 30 năm." : "";
  const changed = value !== goal.targetAmount || dateValue !== goal.targetDate;
  // Cần góp mỗi tháng nếu mục tiêu có giá trị mới (cùng cách tính với màn tổng quan).
  const recalculated = requiredMonthly(state, { ...goal, targetAmount: value, targetDate: dateValue });
  const dayValue = day ?? so?.dayOfMonth ?? Math.min(28, state.customer.salaryDay + 1);

  const goReview = () => {
    setMonthly(recalculated > 0 ? recalculated : null);
    setAutoOn(so ? so.active : recalculated > 0);
    setStep("review");
  };

  const confirm = () => {
    if (dateValue !== goal.targetDate) dispatch({ type: "extend", goalId, newTargetDate: dateValue });
    if (value !== goal.targetAmount) dispatch({ type: "reduceTarget", goalId, newTargetAmount: value });
    if (autoOn && monthly && monthly > 0) {
      dispatch({ type: "setStandingOrder", goalId, amount: monthly, dayOfMonth: dayValue });
    } else if (so) {
      dispatch({ type: "setStandingOrder", goalId, amount: so.amount, dayOfMonth: so.dayOfMonth, active: false });
    }
    nav.pop();
  };

  if (step === "input") {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <ScreenHeader title="Chỉnh sửa mục tiêu" subtitle={goal.name} />
        <AmountCard title="Giá trị mục tiêu" value={target ?? goal.targetAmount} onChange={setTarget} error={error || undefined} />

        <section className={`${card} flex flex-col gap-3`} aria-label="Ngày đến hạn">
          <h2 className={sectionTitle}>Ngày đến hạn</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="target-date" className={label}>Đạt mục tiêu vào</label>
            <input id="target-date" type="date" className={input} value={dateValue} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value || null)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {[6, 12, 24].map((m) => {
              const d = addMonths(goal.targetDate, m);
              return <SuggestChip key={m} label={`Lùi ${m} tháng`} selected={dateValue === d} onClick={() => setDate(d)} />;
            })}
          </div>
          {dateError && <p className={fieldError}>{dateError}</p>}
        </section>

        <p className="text-[13px] leading-5 text-muted">
          Hiện có {formatVndCompact(ctx.value.total)}. Bước sau sẽ tính lại số tiền góp mỗi tháng để bạn xem và xác nhận.
        </p>
        {error && <p className={fieldError}>{error}</p>}
        <BottomActions inline>
          <button type="button" className={primaryButton} disabled={!!error || !!dateError || !changed} onClick={goReview}>
            Xem lại kế hoạch
          </button>
        </BottomActions>
      </div>
    );
  }

  const monthlyValid = !autoOn || (monthly ?? 0) > 0;
  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title="Xem lại kế hoạch" subtitle={goal.name} />

      <section className={`${card} flex flex-col gap-3`} aria-label="Thay đổi mục tiêu">
        <h2 className={sectionTitle}>Thay đổi</h2>
        <SummaryRows
          rows={[
            { label: "Giá trị mục tiêu", value: `${formatVndCompact(goal.targetAmount)} → ${formatVndCompact(value)}`, emphasis: true },
            { label: "Ngày đến hạn", value: goal.targetDate === dateValue ? formatISODate(dateValue) : `${formatISODate(goal.targetDate)} → ${formatISODate(dateValue)}`, emphasis: goal.targetDate !== dateValue },
            { label: "Hiện có", value: ctx.value.total },
            { label: "Cần góp mỗi tháng (tính lại)", value: recalculated, source: "estimated" },
            { label: "Trích tự động hiện tại", value: so && so.active ? `${formatVnd(so.amount)} · ngày ${so.dayOfMonth}` : "Chưa bật" },
          ]}
        />
      </section>

      <section className={`${card} flex flex-col gap-3`} aria-label="Trích tự động hằng tháng">
        <div className="flex items-center justify-between gap-3">
          <h2 className={sectionTitle}>Trích tự động hằng tháng</h2>
          <Switch checked={autoOn} onChange={setAutoOn} label="Bật trích tự động" />
        </div>
        {autoOn && (
          <>
            <AmountCard
              bare
              title="Số tiền mỗi tháng"
              value={monthly}
              onChange={setMonthly}
              error={monthlyValid ? undefined : "Hãy nhập số tiền trích mỗi tháng."}
              chips={recalculated > 0 ? [{ label: `Đủ kịp hạn ${formatShort(recalculated)}`, amount: recalculated }] : []}
            />
            <div className="flex flex-col gap-2">
              <h3 className={sectionTitle}>Vào ngày</h3>
              <DayOfMonthPicker value={dayValue} onChange={setDay} />
            </div>
          </>
        )}
      </section>

      <BottomActions inline>
        <button type="button" className={primaryButton} disabled={!monthlyValid} onClick={confirm}>
          Xác nhận thay đổi
        </button>
        <button type="button" className={secondaryButton} onClick={() => setStep("input")}>
          Sửa giá trị và ngày
        </button>
      </BottomActions>
    </div>
  );
}
