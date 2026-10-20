"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, X } from "lucide-react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { Sheet } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { addMonths, dayOfMonth, formatISODate, formatMonths, monthsBetween, monthsLeft } from "../../../engine/dates";
import { allocateSurplus, CASHFLOW_NOTE_SHARE, newGoalCashflowNote } from "../../../engine/feasibility";
import type { ScreenProps } from "../../../model/screens";
import { paramNumber, paramString } from "../../../model/screens";
import type { GoalTemplate } from "../../../model/types";
import type { DeclaredAssetInput } from "../../../store/actions";
import { usePersonaCif } from "@/providers/context";
import { usePreview } from "../../../store/PreviewStore";
import { AmountCard, formatShort, SuggestChip } from "../../shared/AmountCard";
import { BottomActions } from "../../shared/BottomActions";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { MonthYearSheet } from "../../shared/Pickers";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { card, chip, chipSelected, fieldError, input, primaryButton, progressTrack, ring, screenPadding, secondaryButton, sectionTitle, figure } from "../../shared/styles";
import { PriceEstimateSheet } from "./PriceEstimateSheet";
import { TEMPLATES, WIZARD_STEPS, countedValue, quickAmountsFor, suggestedTarget, targetDateFromNow, templateConfig, wizardAssets } from "./wizard";


const QUICK_MONTHS = [
  { months: 6, label: "6 tháng" },
  { months: 12, label: "1 năm" },
  { months: 36, label: "3 năm" },
  { months: 60, label: "5 năm" },
];
const MIN_AMOUNT = 1_000_000;

/** Bước 2 · Lập kế hoạch: tên, số tiền, ngày, mức linh hoạt, nạp ban đầu. Tạo (hoặc cập nhật) bản nháp rồi sang mở tài khoản. */
export function GoalInfo({ params }: ScreenProps) {
  const { state, nav } = usePreview();
  const today = state.clock.today;
  // Quay lại từ bước sau thì giữ nguyên những gì khách đã nhập (kế hoạch nằm trong tham số màn hình).
  const saved = { name: paramString(params, "name"), amount: paramNumber(params, "targetAmount"), date: paramString(params, "targetDate") };
  const templateId = (paramString(params, "template") ?? "other") as GoalTemplate;
  const config = templateConfig(templateId);

  const suggestedAmount =
    suggestedTarget(config, state.customer).amount;

  const [name, setName] = useState(saved.name ?? config.defaultName);
  const [amount, setAmount] = useState<number | null>(saved.amount ?? suggestedAmount);
  const [date, setDate] = useState<string>(saved.date ?? targetDateFromNow(today, config.months));
  const [deposit, setDeposit] = useState<number | null>(paramNumber(params, "deposit") ?? null);
  // Mục tiêu tuỳ chỉnh được chọn logo trong các logo có sẵn; các loại khác dùng logo của loại đó.
  const customLogo = templateId === "other";
  const [logo, setLogo] = useState<GoalTemplate>((paramString(params, "icon") as GoalTemplate | undefined) ?? templateId);
  const [logoOpen, setLogoOpen] = useState(false);
  const [assets, setAssets] = useState<DeclaredAssetInput[]>(() => wizardAssets(params));
  const [touched, setTouched] = useState(false);
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
    // Chưa tạo gì: kế hoạch đi tiếp qua tham số, chỉ tạo mục tiêu khi khách xác nhận mở tài khoản.
    const next = { ...snapshot(), targetAmount: amount };
    nav.updateParams(next);
    nav.push("OpenAccountConfirm", next);
  };

  // Giữ những gì đã nhập trong tham số màn hình, để quay lại từ màn thêm tài sản không mất dữ liệu.
  const snapshot = () => ({
    template: templateId,
    name: name.trim(),
    ...(amount !== null ? { targetAmount: amount } : {}),
    targetDate: date,
    deposit: deposit ?? 0,
    assets: JSON.stringify(assets),
    ...(customLogo ? { icon: logo } : {}),
  });
  const addAsset = () => {
    nav.updateParams(snapshot());
    nav.push("AddAsset", { ...snapshot(), wizard: "1" });
  };
  const removeAsset = (index: number) => {
    const next = assets.filter((_, i) => i !== index);
    setAssets(next);
    nav.updateParams({ assets: JSON.stringify(next) });
  };

  const months = monthsBetween(today, date);
  const quickDates = QUICK_MONTHS.map((q) => ({ ...q, date: targetDateFromNow(today, q.months) }));
  const customDate = !quickDates.some((q) => q.date === date);
  const [pickDate, setPickDate] = useState(customDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const cif = usePersonaCif();
  const Icon = templateConfig(customLogo ? logo : templateId).icon;
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
  const assetsCounted = assets.reduce((sum, a) => sum + countedValue(a), 0);
  const start = (deposit ?? 0) + assetsCounted;
  const toSave = Math.max(0, (amount ?? 0) - start);
  const monthly = toSave > 0 && left > 0 ? Math.ceil(toSave / left / 1000) * 1000 : 0;
  const share = free === "unknown" || free <= 0 ? null : monthly / free;
  const tone = share === null ? "muted" : share <= 0.5 ? "positive" : share <= 1 ? "warning" : "negative";

  // "Lưu ý": mục tiêu mới cộng số góp các mục tiêu đang diễn ra quá 70% số dư hằng tháng thì có thể ảnh hưởng dòng tiền mục tiêu hiện có.
  const note = newGoalCashflowNote(state, monthly);

  // One-tap fixes when the plan does not fit the free surplus.
  const fixes: { label: string; apply: () => void }[] = [];
  if (tone === "negative" && free !== "unknown" && free > 0 && amount) {
    const needMonths = Math.ceil(toSave / free);
    if (needMonths > left && needMonths <= 360) {
      const d = targetDateFromNow(today, needMonths);
      fixes.push({ label: `Lùi tới T${Number(d.slice(5, 7))}/${d.slice(0, 4)}`, apply: () => { setDate(d); setPickDate(true); } });
    }
    const reduced = Math.floor((start + free * left) / 1_000_000) * 1_000_000;
    if (reduced >= MIN_AMOUNT && reduced < amount) fixes.push({ label: `Giảm còn ${formatShort(reduced)}`, apply: () => setAmount(reduced) });
    const neededDeposit = Math.ceil((amount - free * left) / 1_000_000) * 1_000_000;
    if (neededDeposit > start && neededDeposit <= state.customer.mainCasaBalance) {
      fixes.push({ label: `Nạp ngay ${formatShort(neededDeposit)}`, apply: () => setDeposit(Math.max(0, neededDeposit - assetsCounted)) });
    }
  }
  const stuck = tone === "negative" && fixes.length === 0;

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Tạo mục tiêu" />
      <StepProgress steps={WIZARD_STEPS} current={1} />

      <section className={`${card} flex items-center gap-3`} aria-label="Tên mục tiêu">
        {customLogo ? (
          <button
            type="button"
            aria-label="Đổi logo mục tiêu"
            onClick={() => setLogoOpen(true)}
            className={cn("relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong", ring)}
          >
            <Icon size={30} strokeWidth={1.8} aria-hidden />
            <span aria-hidden className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-muted shadow-card">
              <Pencil size={11} />
            </span>
          </button>
        ) : (
          <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
            <Icon size={30} strokeWidth={1.8} />
          </span>
        )}
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

      <AmountCard
        title="Bạn cần bao nhiêu?"
        value={amount}
        onChange={setAmount}
        error={touched && errors.amount ? errors.amount : undefined}
        chips={quickAmounts.map((a) => ({ label: formatShort(a), amount: a }))}
        footer={
          cif && (
            <button type="button" onClick={() => setEstimateOpen(true)} className={cn("self-start text-[13px] text-muted", ring)}>
              Chưa rõ? <span className="font-semibold text-primary-strong underline">Để M-You ước tính</span>
            </button>
          )
        }
      />
      <PriceEstimateSheet
        open={estimateOpen}
        cif={cif}
        template={templateId}
        description={name}
        onClose={() => setEstimateOpen(false)}
        onApply={setAmount}
      />

      <section className={`${card} flex flex-col gap-3`} aria-label="Tài sản có sẵn">
        <div className="flex items-center gap-1">
          <h2 className={sectionTitle}>Tài sản có sẵn</h2>
          <InfoTooltip label="tài sản có sẵn" text="Nhà, xe, vàng, cổ phiếu, tiền gửi ở nơi khác… bạn đã có và muốn tính vào mục tiêu này. Phần được tính sẽ giảm số tiền bạn cần tiết kiệm thêm." />
        </div>
        {assets.length > 0 && (
          <ul className="flex flex-col gap-2">
            {assets.map((a, i) => (
              <li key={`${a.name}-${i}`} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-muted px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-text">{a.name}</p>
                  <p className="text-[12px] text-muted">
                    Tính vào mục tiêu {formatVnd(countedValue(a))} ({a.countPercent}% của {formatVnd(a.value)})
                  </p>
                </div>
                <button type="button" aria-label={`Bỏ ${a.name}`} onClick={() => removeAsset(i)} className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted", ring)}>
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={secondaryButton} onClick={addAsset}>
          <Plus size={18} aria-hidden /> Thêm tài sản
        </button>
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
          <button type="button" className={pickDate ? chipSelected : chip} onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
            <CalendarDays size={16} aria-hidden className="mr-1.5" /> {pickDate ? `T${month}/${year}` : "Chọn ngày khác"}
          </button>
        </div>
      {customLogo && (
        <Sheet open={logoOpen} title="Chọn logo" onClose={() => setLogoOpen(false)}>
          <div role="radiogroup" aria-label="Logo mục tiêu" className="grid grid-cols-4 gap-3">
            {TEMPLATES.map((t) => {
              const LogoIcon = t.icon;
              const selected = logo === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t.title}
                  onClick={() => { setLogo(t.id); setLogoOpen(false); }}
                  className={cn(
                    "flex h-16 items-center justify-center rounded-2xl border-2 transition-colors",
                    ring,
                    selected ? "border-primary bg-primary-soft text-primary-strong" : "border-transparent bg-surface-muted text-muted",
                  )}
                >
                  <LogoIcon size={26} strokeWidth={1.8} aria-hidden />
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

        <MonthYearSheet
          key={`${year}-${month}-${pickerOpen}`}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          years={years}
          year={year}
          month={month}
          onPick={(y, m) => {
            setMonthYear(y, m);
            setPickDate(true);
          }}
        />
        {errors.date && <p className={fieldError}>{errors.date}</p>}
      </section>

      <AmountCard
        title="Chuyển ngay từ tài khoản chính"
        value={deposit === 0 ? null : deposit}
        onChange={setDeposit}
        error={errors.deposit || undefined}
        help={`Không bắt buộc. Số dư tài khoản chính: ${formatVnd(state.customer.mainCasaBalance)}. Để trống nếu muốn bắt đầu từ 0 VND.`}
        chips={state.customer.mainCasaBalance > 0 ? [{ label: `Tối đa ${formatShort(state.customer.mainCasaBalance)}`, amount: state.customer.mainCasaBalance }] : []}
      />

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
        {note && (
          <p className="text-[13px] leading-5 text-text">
            Lưu ý: mục tiêu mới có thể ảnh hưởng đến dòng tiền các mục tiêu hiện có. Mỗi tháng bạn đang góp {formatVnd(note.existing)} cho các mục tiêu đang diễn ra; cộng {formatVnd(monthly)} cho mục tiêu này là {formatVnd(note.total)}, vượt {Math.round(CASHFLOW_NOTE_SHARE * 100)}% số dư hằng tháng sau khi trừ chi tiêu (mức tối đa {formatVnd(note.limit)}, số dư {formatVnd(note.surplus)}).
          </p>
        )}
        {stuck && (
          <p className="text-[13px] leading-5 text-text">Số dư hằng tháng gần như đã dành cho mục tiêu khác. Bạn vẫn có thể tiếp tục và điều chỉnh sau.</p>
        )}
        {fixes.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {fixes.map((f) => (
              <SuggestChip key={f.label} label={f.label} selected={false} onClick={f.apply} />
            ))}
          </div>
        )}
      </section>

      <BottomActions inline>
        <button type="button" className={primaryButton} onClick={onContinue} disabled={touched && !valid}>
          Tiếp tục
        </button>
      </BottomActions>
    </div>
  );
}
