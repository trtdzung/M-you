"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Lock, MoveHorizontal, Pencil } from "lucide-react";
import { amountInWords } from "@/features/goals/ui/form/amount-in-words";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { addMonths, dayOfMonth, formatISODate, formatMonths, monthsBetween, monthsLeft } from "../../../engine/dates";
import { allocateSurplus } from "../../../engine/feasibility";
import type { ScreenProps } from "../../../model/screens";
import { paramNumber, paramString } from "../../../model/screens";
import type { GoalFlexibility, GoalTemplate } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions } from "../../shared/BottomActions";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { parseVndInput } from "../../shared/MoneyInput";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { card, chip, chipSelected, fieldError, input, primaryButton, progressTrack, ring, screenPadding, sectionTitle, figure } from "../../shared/styles";
import { FLEX_INFO, WIZARD_STEPS, isFlexible, quickAmountsFor, suggestedTarget, targetDateFromNow, templateConfig } from "./wizard";

const groupFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const QUICK_MONTHS = [
  { months: 6, label: "6 tháng" },
  { months: 12, label: "1 năm" },
  { months: 36, label: "3 năm" },
  { months: 60, label: "5 năm" },
];
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
const MIN_AMOUNT = 1_000_000;

/** Bước 2 · Lập kế hoạch: tên, số tiền, ngày, mức linh hoạt, nạp ban đầu. Tạo (hoặc cập nhật) bản nháp rồi sang mở tài khoản. */
export function GoalInfo({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const today = state.clock.today;
  const goalId = paramString(params, "goalId");
  const existing = goalId ? state.goals.find((g) => g.id === goalId && g.status === "draft") : undefined;
  const templateId = (existing?.template ?? paramString(params, "template") ?? "other") as GoalTemplate;
  const config = templateConfig(templateId);

  const suggestedAmount =
    suggestedTarget(config, state.customer).amount;

  const [name, setName] = useState(existing?.name ?? config.defaultName);
  const [amount, setAmount] = useState<number | null>(existing?.targetAmount ?? suggestedAmount);
  const [date, setDate] = useState<string>(existing?.targetDate ?? targetDateFromNow(today, config.months));
  const [flex, setFlex] = useState<GoalFlexibility>(existing?.flexibility ?? config.flexibility);
  const [deposit, setDeposit] = useState<number | null>(paramNumber(params, "deposit") ?? null);
  const depositRef = useRef(0);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const lastCreated = useRef(state.lastCreatedGoalId);

  // After createGoal the new id appears in state; swap this entry to carry it, then move on.
  useEffect(() => {
    if (!pending || !state.lastCreatedGoalId || state.lastCreatedGoalId === lastCreated.current) return;
    const id = state.lastCreatedGoalId;
    setPending(false);
    nav.replace("GoalInfo", { template: templateId, goalId: id, deposit: depositRef.current });
    nav.push("OpenAccountConfirm", { goalId: id, deposit: depositRef.current });
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
    deposit: (deposit ?? 0) > state.customer.mainCasaBalance ? `Tài khoản chính chỉ còn ${formatVnd(state.customer.mainCasaBalance)}.` : "",
    date: date < minDate ? "Ngày đạt mục tiêu cần cách hôm nay ít nhất 1 tháng." : monthsBetween(today, date) > 360 ? "Thời hạn tối đa là 30 năm." : "",
  };
  const valid = !errors.name && !errors.amount && !errors.date && !errors.deposit;

  const setMonthYear = (y: number, m: number) => {
    const day = Math.min(28, dayOfMonth(today));
    setDate(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  };

  const onContinue = () => {
    setTouched(true);
    if (!valid || amount === null) return;
    const payload = { name: name.trim(), template: templateId, targetAmount: amount, targetDate: date, flexibility: flex };
    const start = deposit ?? 0;
    depositRef.current = start;
    if (existing) {
      dispatch({ type: "updateDraftGoal", goalId: existing.id, patch: payload });
      nav.updateParams({ deposit: start });
      nav.push("OpenAccountConfirm", { goalId: existing.id, deposit: start });
    } else {
      lastCreated.current = state.lastCreatedGoalId;
      dispatch({ type: "createGoal", input: payload });
      setPending(true);
    }
  };

  const months = monthsBetween(today, date);
  const quickDates = QUICK_MONTHS.map((q) => ({ ...q, date: targetDateFromNow(today, q.months) }));
  const customDate = !quickDates.some((q) => q.date === date);
  const [pickDate, setPickDate] = useState(customDate);
  const Icon = config.icon;
  const quickAmounts = quickAmountsFor(config, state.customer);

  // Live preview: what this plan asks for each month vs the surplus still free.
  const surplus = state.customer.monthlySurplus;
  const free = useMemo(() => {
    if (surplus === "unknown") return "unknown" as const;
    const loans = state.loans.filter((l) => l.status === "active").reduce((sum, l) => sum + l.monthlyPayment, 0);
    const used = Object.values(allocateSurplus(state)).reduce<number>((sum, a) => sum + (typeof a === "number" ? a : 0), 0);
    return Math.max(0, surplus - loans - used);
  }, [state, surplus]);
  const left = monthsLeft(today, date);
  const start = deposit ?? 0;
  const toSave = Math.max(0, (amount ?? 0) - start);
  const monthly = toSave > 0 && left > 0 ? Math.ceil(toSave / left / 1000) * 1000 : 0;
  const share = free === "unknown" || free <= 0 ? null : monthly / free;
  const tone = share === null ? "muted" : share <= 0.5 ? "positive" : share <= 1 ? "warning" : "negative";
  const flexKey = isFlexible(flex) ? "flexible" : "fixed";

  // One-tap fixes when the plan does not fit the free surplus.
  const fixes: { label: string; apply: () => void }[] = [];
  if (tone === "negative" && free !== "unknown" && free > 0 && amount) {
    const needMonths = Math.ceil(toSave / free);
    if (needMonths > left && needMonths <= 360) {
      const d = targetDateFromNow(today, needMonths);
      fixes.push({ label: `Lùi tới T${Number(d.slice(5, 7))}/${d.slice(0, 4)}`, apply: () => { setDate(d); setPickDate(true); } });
    }
    const reduced = Math.floor((start + free * left) / 1_000_000) * 1_000_000;
    if (reduced >= MIN_AMOUNT && reduced < amount) fixes.push({ label: `Giảm còn ${formatVndCompact(reduced)}`, apply: () => setAmount(reduced) });
    const neededDeposit = Math.ceil((amount - free * left) / 1_000_000) * 1_000_000;
    if (neededDeposit > start && neededDeposit <= state.customer.mainCasaBalance) {
      fixes.push({ label: `Nạp ngay ${formatVndCompact(neededDeposit)}`, apply: () => setDeposit(neededDeposit) });
    }
  }
  const stuck = tone === "negative" && fixes.length === 0;

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Tạo mục tiêu" />
      <StepProgress steps={WIZARD_STEPS} current={1} />

      <section className={`${card} flex items-center gap-3`} aria-label="Tên mục tiêu">
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
          <Icon size={30} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <label className="flex items-center gap-2">
            <span className="sr-only">Tên mục tiêu</span>
            <input
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Đặt tên mục tiêu"
              className={cn("min-h-10 w-full min-w-0 rounded-lg bg-transparent text-[20px] font-bold text-text placeholder:text-muted", ring)}
              aria-invalid={touched && errors.name ? true : undefined}
            />
            <Pencil size={16} aria-hidden className="shrink-0 text-muted" />
          </label>
        </div>
      </section>
      {touched && errors.name && <p className={fieldError}>{errors.name}</p>}

      <section className={`${card} flex flex-col gap-3`} aria-labelledby="goal-amount-label">
        <div className="flex items-center gap-1">
          <h2 id="goal-amount-label" className={sectionTitle}>Bạn cần bao nhiêu?</h2>
          {amount ? <InfoTooltip label="cách đọc số tiền" text={amountInWords(amount)} /> : null}
        </div>
        <div className="flex items-baseline gap-2">
          <input
            aria-labelledby="goal-amount-label"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={amount === null ? "" : groupFormatter.format(amount)}
            onChange={(e) => setAmount(parseVndInput(e.target.value))}
            aria-invalid={touched && errors.amount ? true : undefined}
            className={cn("min-h-12 w-full min-w-0 rounded-lg bg-transparent text-[28px] font-bold tabular-nums text-text", ring)}
          />
          <span className="text-sm text-muted">đồng</span>
        </div>
        {touched && errors.amount && <p className={fieldError}>{errors.amount}</p>}
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((a) => (
            <button key={a} type="button" className={a === amount ? chipSelected : chip} onClick={() => setAmount(a)}>
              {formatVndCompact(a)}
            </button>
          ))}
        </div>
      </section>

      <section className={`${card} flex flex-col gap-3`} aria-label="Thời hạn">
        <div className="flex items-center gap-1">
          <h2 className={sectionTitle}>Muốn đạt vào lúc nào?</h2>
          {!errors.date && <InfoTooltip label="ngày đạt mục tiêu" text={`Đạt vào ${formatISODate(date)} · còn khoảng ${formatMonths(Math.max(0, months))}.`} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {quickDates.map((q) => (
            <button key={q.months} type="button" className={q.date === date && !pickDate ? chipSelected : chip} onClick={() => { setDate(q.date); setPickDate(false); }}>
              {q.label}
            </button>
          ))}
          <button type="button" className={pickDate ? chipSelected : chip} onClick={() => setPickDate(true)} aria-expanded={pickDate}>
            <CalendarDays size={16} aria-hidden className="mr-1.5" /> {pickDate ? `T${month}/${year}` : "Chọn ngày khác"}
          </button>
        </div>
        {pickDate && (
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
        )}
        {errors.date && <p className={fieldError}>{errors.date}</p>}
      </section>

      <section className={`${card} flex flex-col gap-3`} aria-label="Mức linh hoạt">
        <div className="flex items-center gap-1">
          <h2 className={sectionTitle}>Kế hoạch có linh hoạt không?</h2>
          <InfoTooltip label="mức linh hoạt" text={`${FLEX_INFO.fixed.title}: ${FLEX_INFO.fixed.text} ${FLEX_INFO.flexible.title}: ${FLEX_INFO.flexible.text}`} />
        </div>
        <div role="radiogroup" aria-label="Mức linh hoạt" className="grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1">
          {(["fixed", "flexible"] as const).map((key) => {
            const opt = FLEX_INFO[key];
            const selected = flexKey === key;
            const OptIcon = key === "fixed" ? Lock : MoveHorizontal;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFlex(opt.value)}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors",
                  selected ? "bg-surface text-primary-strong shadow-card" : "text-muted",
                  ring,
                )}
              >
                <OptIcon size={16} aria-hidden /> {opt.title}
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${card} flex flex-col gap-2`} aria-labelledby="goal-deposit-label">
        <div className="flex items-center gap-1">
          <h2 id="goal-deposit-label" className={sectionTitle}>Chuyển ngay từ tài khoản chính</h2>
          <InfoTooltip label="nạp ban đầu" text={`Không bắt buộc. Số dư tài khoản chính: ${formatVnd(state.customer.mainCasaBalance)}. Để trống nếu muốn bắt đầu từ 0 đồng.`} />
        </div>
        <div className="flex items-baseline gap-2">
          <input
            aria-labelledby="goal-deposit-label"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={deposit === null || deposit === 0 ? "" : groupFormatter.format(deposit)}
            onChange={(e) => setDeposit(parseVndInput(e.target.value))}
            aria-invalid={errors.deposit ? true : undefined}
            className={cn("min-h-11 w-full min-w-0 rounded-lg bg-transparent text-[20px] font-bold tabular-nums text-text placeholder:text-muted", ring)}
          />
          <span className="text-sm text-muted">đồng</span>
        </div>
        {errors.deposit && <p className={fieldError}>{errors.deposit}</p>}
      </section>

      <section
        aria-live="polite"
        className={cn(
          "flex flex-col gap-2 rounded-card p-4",
          tone === "positive" && "bg-positive-soft",
          tone === "warning" && "bg-warning-soft",
          tone === "negative" && "bg-negative-soft",
          tone === "muted" && "bg-surface-tint",
        )}
      >
        <div className="flex items-center gap-1">
          <p className="text-[13px] text-muted">Mỗi tháng cần góp khoảng</p>
          <InfoTooltip
            label="mức góp mỗi tháng"
            warning={tone === "negative"}
            text={
              free === "unknown"
                ? "Chưa đủ dữ liệu thu chi để so với số dư hằng tháng."
                : share === null
                  ? "Số dư hằng tháng đã dành hết cho các mục tiêu khác và khoản trả góp."
                  : share <= 1
                    ? `Bằng khoảng ${Math.round(share * 100)}% số dư còn trống mỗi tháng (${formatVnd(free)}), sau các mục tiêu khác và khoản trả góp.`
                    : `Vượt số dư còn trống mỗi tháng (${formatVnd(free)}). Thử lùi ngày hoặc giảm số tiền.`
            }
          />
        </div>
        <p className={figure}>{monthly > 0 ? formatVnd(monthly) : "—"}</p>
        {share !== null && (
          <div className="flex items-center gap-3">
            <div className={cn(progressTrack, "flex-1")}>
              <div
                className={cn("h-full rounded-full", tone === "positive" ? "bg-positive" : tone === "warning" ? "bg-warning" : "bg-negative")}
                style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
              />
            </div>
            <span className="text-[13px] font-semibold tabular-nums text-text">{share <= 1 ? `${Math.round(share * 100)}% số dư` : "Vượt số dư"}</span>
          </div>
        )}
        {stuck && (
          <p className="text-[13px] leading-5 text-text">Số dư hằng tháng gần như đã dành cho mục tiêu khác. Bạn vẫn có thể tiếp tục và điều chỉnh sau.</p>
        )}
        {fixes.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {fixes.map((f) => (
              <button key={f.label} type="button" className={chip} onClick={f.apply}>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </section>

      <BottomActions inline>
        <button type="button" className={primaryButton} onClick={onContinue} disabled={pending || (touched && !valid)}>
          Tiếp tục
        </button>
      </BottomActions>
    </div>
  );
}
