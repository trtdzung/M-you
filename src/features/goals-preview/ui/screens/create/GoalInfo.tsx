"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { addMonths, dayOfMonth, formatISODate, formatMonths, monthsBetween } from "../../../engine/dates";
import type { ScreenProps } from "../../../model/screens";
import { paramString } from "../../../model/screens";
import type { GoalFlexibility, GoalTemplate } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions } from "../../shared/BottomActions";
import { MoneyInput } from "../../shared/MoneyInput";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { chip, chipSelected, fieldError, hint, input, label, primaryButton, screenPadding } from "../../shared/styles";
import { FLEX_INFO, WIZARD_STEPS, isFlexible, targetDateFromNow, templateConfig } from "./wizard";

const QUICK_MONTHS = [
  { months: 6, label: "6 tháng" },
  { months: 12, label: "1 năm" },
  { months: 36, label: "3 năm" },
  { months: 60, label: "5 năm" },
];
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
const MIN_AMOUNT = 1_000_000;

/** Bước 2: tên, số tiền, ngày, mức linh hoạt. Tạo (hoặc cập nhật) bản nháp rồi đi tiếp. */
export function GoalInfo({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const today = state.clock.today;
  const goalId = paramString(params, "goalId");
  const existing = goalId ? state.goals.find((g) => g.id === goalId && g.status === "draft") : undefined;
  const templateId = (existing?.template ?? paramString(params, "template") ?? "other") as GoalTemplate;
  const config = templateConfig(templateId);

  const suggestedAmount =
    config.id === "emergency" ? Math.max(config.amount, Math.round((state.customer.monthlyExpenses * 6) / 1_000_000) * 1_000_000) : config.amount;

  const [name, setName] = useState(existing?.name ?? config.defaultName);
  const [amount, setAmount] = useState<number | null>(existing?.targetAmount ?? suggestedAmount);
  const [date, setDate] = useState<string>(existing?.targetDate ?? targetDateFromNow(today, config.months));
  const [flex, setFlex] = useState<GoalFlexibility>(existing?.flexibility ?? config.flexibility);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const lastCreated = useRef(state.lastCreatedGoalId);

  // After createGoal the new id appears in state; swap this entry to carry it, then move on.
  useEffect(() => {
    if (!pending || !state.lastCreatedGoalId || state.lastCreatedGoalId === lastCreated.current) return;
    const id = state.lastCreatedGoalId;
    setPending(false);
    nav.replace("GoalInfo", { template: templateId, goalId: id });
    nav.push("OpeningFunds", { goalId: id });
  }, [pending, state.lastCreatedGoalId, nav, templateId]);

  const [year, month] = date.split("-").map(Number);
  const minDate = addMonths(today, 1);
  const years = useMemo(() => {
    const y0 = Number(today.slice(0, 4));
    return Array.from({ length: 31 }, (_, i) => y0 + i);
  }, [today]);

  const errors = {
    name: name.trim().length < 2 ? "Hãy đặt tên ít nhất 2 ký tự để dễ nhận ra mục tiêu." : "",
    amount: !amount ? "Hãy nhập số tiền bạn muốn đạt được." : amount < MIN_AMOUNT ? `Số tiền tối thiểu là ${formatVnd(MIN_AMOUNT)}.` : "",
    date: date < minDate ? "Ngày đạt mục tiêu cần cách hôm nay ít nhất 1 tháng." : monthsBetween(today, date) > 360 ? "Thời hạn tối đa là 30 năm." : "",
  };
  const valid = !errors.name && !errors.amount && !errors.date;

  const setMonthYear = (y: number, m: number) => {
    const day = Math.min(28, dayOfMonth(today));
    setDate(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  };

  const onContinue = () => {
    setTouched(true);
    if (!valid || amount === null) return;
    const payload = { name: name.trim(), template: templateId, targetAmount: amount, targetDate: date, flexibility: flex };
    if (existing) {
      dispatch({ type: "updateDraftGoal", goalId: existing.id, patch: payload });
      nav.push("OpeningFunds", { goalId: existing.id });
    } else {
      lastCreated.current = state.lastCreatedGoalId;
      dispatch({ type: "createGoal", input: payload });
      setPending(true);
    }
  };

  const months = monthsBetween(today, date);

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Thông tin mục tiêu" subtitle={config.title} />
      <StepProgress steps={WIZARD_STEPS} current={1} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal-name" className={label}>
          Tên mục tiêu
        </label>
        <input
          id="goal-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ví dụ: Mua xe cho gia đình"
          className={input}
          aria-invalid={touched && errors.name ? true : undefined}
        />
        {touched && errors.name && <p className={fieldError}>{errors.name}</p>}
      </div>

      <MoneyInput
        label="Số tiền cần có"
        value={amount}
        onChange={setAmount}
        error={touched ? errors.amount : undefined}
        hint={`Gợi ý cho “${config.title}”: ${formatVnd(suggestedAmount)}`}
      />

      <div className="flex flex-col gap-2">
        <span className={label}>Muốn đạt vào lúc nào?</span>
        <div className="flex flex-wrap gap-2">
          {QUICK_MONTHS.map((q) => {
            const d = targetDateFromNow(today, q.months);
            return (
              <button key={q.months} type="button" className={d === date ? chipSelected : chip} onClick={() => setDate(d)}>
                {q.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Tháng" className={input} value={month} onChange={(e) => setMonthYear(year, Number(e.target.value))}>
            {MONTH_NAMES.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
          <select aria-label="Năm" className={input} value={year} onChange={(e) => setMonthYear(Number(e.target.value), month)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {errors.date ? (
          <p className={fieldError}>{errors.date}</p>
        ) : (
          <p className={hint}>
            Ngày đạt mục tiêu: {formatISODate(date)} · còn khoảng {formatMonths(Math.max(0, months))}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={label}>Kế hoạch này có thay đổi được không?</legend>
        {[FLEX_INFO.fixed, FLEX_INFO.flexible].map((opt) => {
          const selected = opt.value === "date_fixed" ? flex === "date_fixed" : isFlexible(flex);
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setFlex(opt.value)}
              className={`flex min-h-14 flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 text-left transition-colors ${
                selected ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <span className="text-[15px] font-semibold text-text">{opt.title}</span>
              <span className="text-[13px] leading-5 text-muted">{opt.text}</span>
            </button>
          );
        })}
      </fieldset>

      <BottomActions>
        <button type="button" className={primaryButton} onClick={onContinue} disabled={pending || (touched && !valid)}>
          Tiếp tục
        </button>
      </BottomActions>
    </div>
  );
}
