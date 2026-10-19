"use client";

import { useState } from "react";
import { CalendarCheck, CalendarClock } from "lucide-react";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { addMonths, buildSchedule, feasibility, formatISODate, formatMonths, goalValue, quoteLoan, totalInterest } from "../../../engine";
import { paramNumber, paramString, type ScreenProps } from "../../../model/screens";
import { AmountCard, SuggestChip } from "../../shared/AmountCard";
import { BottomActions, ScreenHeader } from "../../shared";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { card, ghostButton, heroNumber, primaryButton, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
import { DtiGauge, INDICATIVE_NOTE, NotFoundScreen, loanGap, productForGoal, roundUp, useLoanScreen } from "./shared";

const TERM_CHOICES: Record<"house" | "car" | "consumer", number[]> = {
  house: [60, 120, 180, 240],
  car: [12, 24, 36, 60],
  consumer: [12, 24, 36, 60],
};

const rateText = (ratePa: number) => `${String(ratePa).replace(".", ",")}%/năm`;

/**
 * Vay để đạt mục tiêu: shows what the loan buys (reaching the goal on its date vs later), a prefilled
 * MSB loan for the goal's purpose (nhà → vay mua nhà, xe → vay mua xe, còn lại → tiêu dùng), and a real
 * action — reserve now (disbursed on the target date), add to a draft plan, or apply when due.
 */
export function LoanSimulator({ params }: ScreenProps) {
  const { state, goal, nav, today, dispatch } = useLoanScreen(params);
  const [amount, setAmount] = useState<number | null>(paramNumber(params, "amount") ?? goal?.plannedLoan?.principal ?? null);
  const [term, setTerm] = useState<number | undefined>(paramNumber(params, "termMonths") ?? goal?.plannedLoan?.termMonths);

  if (!goal) return <NotFoundScreen title="Mô phỏng khoản vay" onCta={() => nav.push("GoalList")} />;

  const product = productForGoal(goal);
  const deposit = paramNumber(params, "deposit") ?? 0;
  const isDraft = goal.status === "draft";
  const gap = loanGap(state, goal, deposit);
  const step = product.maxAmount >= 2_000_000_000 ? 10_000_000 : 1_000_000;
  const gapRounded = Math.min(product.maxAmount, Math.max(product.minAmount, roundUp(gap, step)));
  const principal = amount ?? gapRounded;
  const amountError =
    principal < product.minAmount
      ? `Tối thiểu ${formatVnd(product.minAmount)}.`
      : principal > product.maxAmount
        ? `Tối đa ${formatVnd(product.maxAmount)}.`
        : undefined;
  const terms = TERM_CHOICES[product.purpose].filter((m) => m <= product.maxTermMonths);
  const defaultTerm = terms.includes(36) ? 36 : terms[terms.length - 1];
  const termMonths = term && terms.includes(term) ? term : defaultTerm;

  const isDue = goal.status === "missed" || (!isDraft && today >= goal.targetDate);
  const startDate = isDue ? today : goal.targetDate;
  const quote = quoteLoan(state, { productId: product.id, principal, ratePa: product.ratePa, termMonths, startDate });
  const totalInt = totalInterest(buildSchedule(principal, product.ratePa, termMonths, startDate));
  const blocked = !quote.affordability.allowed;
  const lenderParams = { goalId: goal.id, productId: product.id, amount: principal, termMonths, deposit: isDraft ? deposit : undefined };
  const short = gap > 0;
  const reserved = goal.plannedLoan;
  const canReserve = !isDraft && !isDue && (goal.status === "accumulating" || goal.status === "paused");

  // Without the loan: when would saving alone reach the target?
  const fe = isDraft ? undefined : feasibility(state, goal);
  const have = isDraft ? deposit : goalValue(state, goal).total;
  const pace = fe && typeof fe.allocatedMonthly === "number" ? fe.allocatedMonthly : 0;
  const soloDate = pace > 0 ? addMonths(today, Math.ceil(Math.max(0, goal.targetAmount - have) / pace)) : undefined;

  // Only draft and due goals act on the loan; before the due date the simulation is information only.
  const primary = amountError ? (
    <button type="button" className={primaryButton} disabled>
      Kiểm tra lại số tiền vay
    </button>
  ) : blocked ? (
    <button type="button" className={primaryButton} onClick={() => nav.push("LoanBlocked", lenderParams)}>
      Xem vì sao chưa vay được
    </button>
  ) : isDraft ? (
    <button type="button" className={primaryButton} onClick={() => nav.push("OpenAccountConfirm", lenderParams)}>
      Đưa vào kế hoạch
    </button>
  ) : isDue ? (
    <button type="button" className={primaryButton} onClick={() => nav.push("LoanApply", lenderParams)}>
      Đăng ký vay
    </button>
  ) : short && canReserve ? (
    <button
      type="button"
      className={primaryButton}
      onClick={() => {
        dispatch({ type: "reserveLoan", goalId: goal.id, productId: product.id, principal, termMonths });
        nav.pop();
      }}
    >
      {reserved ? "Cập nhật khoản vay đặt trước" : "Đặt trước khoản vay"}
    </button>
  ) : (
    <button type="button" className={primaryButton} onClick={() => nav.pop()}>
      Quay lại mục tiêu
    </button>
  );

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Vay để đạt mục tiêu" subtitle={goal.name} />

      {short ? (
        <section className={`${card} flex flex-col gap-3`} aria-label="Lợi ích của khoản vay">
          <div className="flex items-center gap-1">
            <h2 className={sectionTitle}>
              {isDue ? "Còn thiếu" : "Dự kiến thiếu"} {formatVndCompact(gap)} để đạt mục tiêu
            </h2>
            <InfoTooltip
              label="cách tính và lưu ý"
              text={`Mục tiêu ${formatVnd(goal.targetAmount)} trừ phần bạn đã có và sẽ tích luỹ thêm. Nên cân nhắc tiết kiệm thêm hoặc lùi ngày trước; khoản vay chỉ bù đúng phần còn thiếu.`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 rounded-2xl bg-positive-soft p-3">
              <span className="flex items-center gap-1 text-[12px] font-semibold text-positive">
                <CalendarCheck size={14} aria-hidden /> Có khoản vay
              </span>
              <span className="text-[16px] font-bold tabular-nums text-text">{isDue ? "Ngay bây giờ" : formatISODate(goal.targetDate)}</span>
              <span className="text-[12px] text-muted">đúng hạn</span>
            </div>
            <div className="flex flex-col gap-1 rounded-2xl bg-surface-muted/70 p-3">
              <span className="flex items-center gap-1 text-[12px] font-semibold text-muted">
                <CalendarClock size={14} aria-hidden /> Chỉ tự tích luỹ
              </span>
              <span className="text-[16px] font-bold tabular-nums text-text">{soloDate ? formatISODate(soloDate) : "Chưa xác định"}</span>
              <span className="text-[12px] text-muted">{soloDate ? `chậm ${formatMonths(Math.max(0, Math.round((Date.parse(soloDate) - Date.parse(goal.targetDate)) / 2_629_746_000)))}` : "chưa đủ dữ liệu thu chi"}</span>
            </div>
          </div>
          <button type="button" className={`${ghostButton} self-start -ml-3 !min-h-9`} onClick={() => nav.push("OptionsCompare", { goalId: goal.id })}>
            Xem cách khác không cần vay
          </button>
        </section>
      ) : (
        <p className={`${card} text-sm text-text`}>Kế hoạch hiện tại đủ để đạt mục tiêu đúng hạn, bạn chưa cần vay.</p>
      )}

      {short && (
      <section className={`${card} flex flex-col gap-4`} aria-label="Khoản vay">
        <div className="flex items-center justify-between gap-2">
          <h2 className={sectionTitle}>{product.name.replace(" MSB", "")}</h2>
          <span className="text-[13px] font-semibold text-text">{rateText(product.ratePa)}</span>
        </div>
        <AmountCard
          bare
          title="Số tiền vay"
          value={principal}
          onChange={setAmount}
          error={amountError}
          chips={[{ label: `Đủ bù phần thiếu ${formatVndCompact(gapRounded)}`, amount: gapRounded }]}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <h3 className={sectionTitle}>Kỳ hạn</h3>
            <InfoTooltip label="chọn kỳ hạn" text={`Tối đa ${formatMonths(product.maxTermMonths)}. Kỳ hạn dài thì trả mỗi tháng ít hơn nhưng tổng lãi cao hơn.`} />
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kỳ hạn vay">
            {terms.map((m) => (
              <SuggestChip key={m} label={formatMonths(m)} selected={m === termMonths} onClick={() => setTerm(m)} />
            ))}
          </div>
        </div>
      </section>
      )}

      {short && reserved && canReserve && (
        <section className={`${card} flex flex-wrap items-center justify-between gap-2`} aria-label="Khoản vay đã đặt trước">
          <span className="text-[13px] text-text">
            Đã đặt trước {formatVndCompact(reserved.principal)} · {formatMonths(reserved.termMonths)}
          </span>
          <button type="button" className={`${ghostButton} !min-h-9 !text-negative`} onClick={() => dispatch({ type: "cancelReservedLoan", goalId: goal.id })}>
            Huỷ đặt trước
          </button>
        </section>
      )}

      {short && !amountError && (
        <section className={`${card} flex flex-col gap-3`} aria-label="Kết quả mô phỏng">
          <div className="flex items-center gap-1">
            <p className="text-[13px] text-muted">Trả mỗi tháng khoảng</p>
            <InfoTooltip label="lưu ý về lãi suất" text={INDICATIVE_NOTE} />
          </div>
          <p className={heroNumber}>{formatVndCompact(quote.monthlyPayment)}</p>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-muted/70 p-3">
              <dt className="text-[12px] text-muted">Tổng lãi</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-text">{formatVndCompact(totalInt)}</dd>
            </div>
            <div className="rounded-2xl bg-surface-muted/70 p-3">
              <dt className="text-[12px] text-muted">Tổng phải trả</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-text">{formatVndCompact(principal + totalInt)}</dd>
            </div>
          </dl>
          <DtiGauge
            compact
            dti={quote.affordability.dti}
            newPayment={quote.monthlyPayment}
            existingDebt={state.customer.existingDebtPayment}
            income={state.customer.monthlyIncome}
          />
          {blocked && <p className={warningBox}>Khoản trả vượt 40% thu nhập nên MSB chưa thể cho vay. Thử giảm số tiền hoặc kéo dài kỳ hạn.</p>}
        </section>
      )}

      <BottomActions>{primary}</BottomActions>
    </div>
  );
}
