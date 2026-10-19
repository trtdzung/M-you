"use client";

import { useState } from "react";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { buildSchedule, formatMonths, quoteLoan, totalInterest } from "../../../engine";
import { paramNumber, paramString, type ScreenProps } from "../../../model/screens";
import { AmountCard, SuggestChip } from "../../shared/AmountCard";
import { BottomActions, ScreenHeader } from "../../shared";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { card, figure, ghostButton, heroNumber, primaryButton, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
import { DtiGauge, INDICATIVE_NOTE, NotFoundScreen, loanGap, productForGoal, roundUp, useLoanScreen } from "./shared";

const TERM_CHOICES: Record<"house" | "car" | "consumer", number[]> = {
  house: [60, 120, 180, 240],
  car: [12, 24, 36, 60],
  consumer: [12, 24, 36, 60],
};

const rateText = (ratePa: number) => `${String(ratePa).replace(".", ",")}%/năm`;

/**
 * Mô phỏng khoản vay: phần còn thiếu → số tiền, kỳ hạn → khoản trả & DTI.
 * The loan product always matches the goal's purpose (nhà → vay mua nhà, xe → vay mua xe, còn lại → tiêu dùng).
 */
export function LoanSimulator({ params }: ScreenProps) {
  const { state, goal, nav, today } = useLoanScreen(params);
  const [amount, setAmount] = useState<number | null>(paramNumber(params, "amount") ?? null);
  const [term, setTerm] = useState<number | undefined>(paramNumber(params, "termMonths"));

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
  ) : (
    <button type="button" className={primaryButton} onClick={() => nav.pop()}>
      Quay lại mục tiêu
    </button>
  );

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Mô phỏng khoản vay" subtitle={goal.name} />

      <section className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1" aria-label="Lưu ý về vay">
        <span className="text-[13px] text-muted">Vay là phương án cuối cùng.</span>
        <button type="button" className={`${ghostButton} -ml-2 !min-h-9`} onClick={() => nav.push("OptionsCompare", { goalId: goal.id })}>
          Xem phương án khác
        </button>
      </section>

      <section className={`${card} flex flex-col gap-1`} aria-label="Phần còn thiếu">
        <div className="flex items-center gap-1">
          <p className="text-[13px] text-muted">{isDue ? "Còn thiếu hôm nay" : "Dự kiến còn thiếu khi đến hạn"}</p>
          <InfoTooltip
            label="cách tính phần còn thiếu"
            text={`Mục tiêu ${formatVnd(goal.targetAmount)} trừ phần bạn đã có và sẽ tích luỹ thêm: còn thiếu ${formatVnd(gap)}.`}
          />
        </div>
        <p className={figure}>{formatVndCompact(gap)}</p>
      </section>

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

      {!amountError && (
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
