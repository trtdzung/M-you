"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";
import { LOAN_PRODUCTS } from "../../../data/products";
import { buildSchedule, formatMonths, quoteLoan, totalInterest } from "../../../engine";
import { paramNumber, paramString, type ScreenProps } from "../../../model/screens";
import { Amount, BottomActions, GoalStatusBadge, ScreenHeader, SliderRow, SummaryRows } from "../../shared";
import { card, chip, chipSelected, ghostButton, infoBox, primaryButton, screenPadding, warningBox } from "../../shared/styles";
import { DtiGauge, INDICATIVE_NOTE, NotFoundScreen, Section, loanGap, productForGoal, resolveProduct, roundUp, useLoanScreen } from "./shared";

/** Mô phỏng khoản vay: gap → chọn sản phẩm, số tiền, kỳ hạn → khoản trả & DTI. */
export function LoanSimulator({ params }: ScreenProps) {
  const { state, goal, nav, today, toast } = useLoanScreen(params);
  const [productId, setProductId] = useState<string | undefined>(paramString(params, "productId"));
  const [amount, setAmount] = useState<number | undefined>(paramNumber(params, "amount"));
  const [term, setTerm] = useState<number | undefined>(paramNumber(params, "termMonths"));

  if (!goal) return <NotFoundScreen title="Mô phỏng khoản vay" onCta={() => nav.push("GoalList")} />;

  const product = resolveProduct(goal, productId);
  const gap = loanGap(state, goal);
  const defaultTerm = Math.min(product.maxTermMonths, product.purpose === "house" ? 240 : product.purpose === "car" ? 60 : 36);
  const step = product.maxAmount >= 2_000_000_000 ? 10_000_000 : 1_000_000;
  const sliderMax = Math.min(product.maxAmount, Math.max(product.minAmount, roundUp(Math.max(gap * 1.5, gap + step), step)));
  const principal = Math.min(sliderMax, Math.max(product.minAmount, amount ?? roundUp(gap, step)));
  const termMonths = Math.min(product.maxTermMonths, Math.max(12, term ?? defaultTerm));

  const isDue = goal.status === "missed" || today >= goal.targetDate;
  const startDate = isDue ? today : goal.targetDate;
  const quote = quoteLoan(state, { productId: product.id, principal, ratePa: product.ratePa, termMonths, startDate });
  const totalInt = totalInterest(buildSchedule(principal, product.ratePa, termMonths, startDate));
  const blocked = !quote.affordability.allowed;
  const covers = principal >= gap;
  const lenderParams = { goalId: goal.id, productId: product.id, amount: principal, termMonths };

  const pickProduct = (id: string) => {
    setProductId(id);
    setAmount(undefined);
    setTerm(undefined);
  };

  const primary = blocked ? (
    <button type="button" className={primaryButton} onClick={() => nav.push("LoanBlocked", lenderParams)}>
      Xem vì sao chưa vay được
    </button>
  ) : isDue ? (
    <button type="button" className={primaryButton} onClick={() => nav.push("LoanApply", lenderParams)}>
      Đăng ký vay
    </button>
  ) : (
    <button
      type="button"
      className={primaryButton}
      onClick={() => {
        toast("Đã ghi nhận phương án vay dự phòng. Bạn chỉ phải quyết định khi đến hạn.", "success");
        nav.pop();
      }}
    >
      Đưa vào kế hoạch
    </button>
  );

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Mô phỏng khoản vay" subtitle={goal.name} />

      <div className={infoBox}>
        <p className="font-semibold text-text">Vay là phương án cuối cùng</p>
        <p className="mt-1 text-muted">
          Hãy cân nhắc tiết kiệm thêm, lùi ngày hoặc giảm số tiền mục tiêu trước. Vay chỉ để lấp phần còn thiếu.
        </p>
        <button type="button" className={`${ghostButton} -ml-3 mt-1`} onClick={() => nav.push("OptionsCompare", { goalId: goal.id })}>
          So sánh các phương án khác
        </button>
      </div>

      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{isDue ? "Còn thiếu hôm nay" : "Dự kiến còn thiếu khi đến hạn"}</p>
            <Amount amount={gap} source="estimated" className="text-[22px] font-bold" />
          </div>
          <GoalStatusBadge status={goal.status} />
        </div>
        <p className="mt-2 text-[13px] leading-5 text-muted">
          Mục tiêu {formatVnd(goal.targetAmount)} trừ phần bạn đã có và sẽ tích luỹ thêm. Khoản vay sẽ bù đúng phần thiếu này.
        </p>
      </section>

      <Section title="Sản phẩm vay">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sản phẩm vay">
          {LOAN_PRODUCTS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === product.id}
              className={p.id === product.id ? chipSelected : chip}
              onClick={() => pickProduct(p.id)}
            >
              {p.name.replace(" MSB", "")} · {p.ratePa}%/năm
            </button>
          ))}
        </div>
        {product.id !== productForGoal(goal).id && (
          <p className="text-[12px] leading-4 text-muted">Sản phẩm gợi ý theo loại mục tiêu là {productForGoal(goal).name}.</p>
        )}
      </Section>

      <Section>
        <SliderRow
          label="Số tiền vay"
          value={principal}
          min={product.minAmount}
          max={sliderMax}
          step={step}
          onChange={setAmount}
          format={formatVnd}
          hint={covers ? "Đủ để bù khoản còn thiếu." : `Thấp hơn khoản thiếu, bạn cần tự bù ${formatVnd(gap - principal)}.`}
        />
        <SliderRow
          label="Kỳ hạn vay"
          value={termMonths}
          min={12}
          max={product.maxTermMonths}
          step={12}
          onChange={setTerm}
          format={formatMonths}
          hint={`Tối đa ${formatMonths(product.maxTermMonths)}. Kỳ hạn dài thì trả mỗi tháng ít hơn nhưng tổng lãi cao hơn.`}
        />
      </Section>

      <Section title="Kết quả mô phỏng">
        <SummaryRows
          rows={[
            { label: "Lãi suất tham khảo", value: `${product.ratePa}%/năm` },
            { label: "Trả mỗi tháng", value: quote.monthlyPayment, source: "estimated", emphasis: true },
            { label: "Tổng lãi phải trả", value: totalInt, source: "estimated" },
            { label: "Tổng số tiền trả", value: principal + totalInt, source: "estimated" },
          ]}
        />
        <div className={card}>
          <DtiGauge
            dti={quote.affordability.dti}
            newPayment={quote.monthlyPayment}
            existingDebt={state.customer.existingDebtPayment}
            income={state.customer.monthlyIncome}
          />
        </div>
        {blocked && (
          <div className={warningBox}>
            Khoản trả này vượt 40% thu nhập nên MSB chưa thể cho vay. Giảm số tiền, kéo dài kỳ hạn hoặc chọn phương án khác.
          </div>
        )}
      </Section>

      <p className="text-[12px] leading-4 text-muted">{INDICATIVE_NOTE}</p>

      <BottomActions>{primary}</BottomActions>
    </div>
  );
}
