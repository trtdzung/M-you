"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/features/goals-preview/format-money";
import { getInvestProduct } from "../../../data/products";
import { addMonths, daysBetween, depositAccrued, idleCash, monthsLeft } from "../../../engine";
import { RISK_LEVEL_LABEL } from "../../../model/labels";
import { paramNumber, paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions, ConfirmSheet, EmptyState, MoneyInput, ScreenHeader } from "../../shared";
import { card, chip, chipSelected, hint, primaryButton, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
import { backToGoalAssets, dateVi, findGoal } from "../assets/helpers";

/** Xác nhận đầu tư: số tiền, kỳ hạn, tóm tắt. */
export function InvestConfirm({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const goal = findGoal(state, paramString(params, "goalId"));
  const product = getInvestProduct(paramString(params, "productId"));
  const idle = goal ? idleCash(state, goal) : 0;
  const [amount, setAmount] = useState<number | null>(paramNumber(params, "amount") ?? null);
  const [term, setTerm] = useState<number | undefined>(paramNumber(params, "termMonths"));
  const [confirm, setConfirm] = useState(false);

  if (!goal || !product) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Xác nhận đầu tư" />
        <EmptyState title="Không tìm thấy sản phẩm" description="Hãy quay lại và chọn lại sản phẩm." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const today = state.clock.today;
  const left = monthsLeft(today, goal.targetDate);
  const terms = product.kind === "term_deposit" ? product.terms.filter((t) => addMonths(today, t.months) <= goal.targetDate) : [];
  const chosenTerm = product.kind === "term_deposit" ? terms.find((t) => t.months === term) ?? terms[terms.length - 1] : undefined;
  const maturityDate = chosenTerm ? addMonths(today, chosenTerm.months) : product.kind === "bond" ? product.maturityDate : undefined;
  const rate = chosenTerm?.ratePa ?? (product.kind === "savings" ? product.ratePa : product.kind === "bond" ? product.couponPa : undefined);
  const interest = amount && rate !== undefined && maturityDate ? depositAccrued(amount, rate, today, maturityDate) : undefined;
  const max = Math.max(idle, 0);

  let error: string | undefined;
  if (amount !== null && amount < product.minAmount) error = `Số tiền tối thiểu là ${formatVnd(product.minAmount)}.`;
  if (product.kind === "term_deposit" && !chosenTerm) error = "Không có kỳ hạn nào đáo hạn trước ngày mục tiêu.";
  const valid = amount !== null && amount >= product.minAmount && amount <= max && !error;
  const pastTarget = !!maturityDate && maturityDate > goal.targetDate;

  const rows = [
    { label: "Mục tiêu", value: goal.name },
    { label: "Sản phẩm", value: product.name },
    ...(chosenTerm ? [{ label: "Kỳ hạn", value: `${chosenTerm.months} tháng` }] : []),
    ...(rate !== undefined ? [{ label: "Lãi suất", value: `${String(rate).replace(".", ",")}%/năm` }] : []),
    ...(maturityDate ? [{ label: "Đáo hạn", value: dateVi(maturityDate) }] : []),
    { label: "Số tiền chuyển đi", value: amount ?? 0, source: "msb" as const, emphasis: true },
    ...(interest !== undefined && product.kind === "term_deposit" ? [{ label: "Lãi dự kiến khi đáo hạn", value: interest, source: "estimated" as const }] : []),
  ];

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Xác nhận đầu tư" subtitle={product.name} />

      <section className={cn(card, "flex flex-col gap-4")}>
        <MoneyInput
          label="Số tiền đầu tư"
          value={amount}
          onChange={setAmount}
          max={max}
          hint={`Tối thiểu ${formatVnd(product.minAmount)}. Tiền nhàn rỗi hiện có ${formatVnd(idle)}.`}
          error={error}
        />
        {product.kind === "term_deposit" && (
          <div className="flex flex-col gap-2">
            <h2 className={sectionTitle}>Kỳ hạn</h2>
            {terms.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kỳ hạn">
                {terms.map((t) => (
                  <button
                    key={t.months}
                    type="button"
                    role="radio"
                    aria-checked={chosenTerm?.months === t.months}
                    className={chosenTerm?.months === t.months ? chipSelected : chip}
                    onClick={() => setTerm(t.months)}
                  >
                    {t.months} tháng · {String(t.ratePa).replace(".", ",")}%
                  </button>
                ))}
              </div>
            ) : (
              <p className={warningBox}>Còn {left} tháng đến ngày mục tiêu, chưa có kỳ hạn nào đáo hạn kịp.</p>
            )}
            <p className={hint}>Chỉ hiện kỳ hạn đáo hạn trước ngày mục tiêu ({dateVi(goal.targetDate)}).</p>
          </div>
        )}
        {product.kind === "fund" && (
          <p className={warningBox}>
            {RISK_LEVEL_LABEL[product.riskLevel]}. Giá thay đổi hằng ngày, bán trong {product.feeFreeAfterMonths} tháng đầu mất phí {String(product.sellFeePct).replace(".", ",")}%.
          </p>
        )}
        {pastTarget && <p className={warningBox}>Sản phẩm này đáo hạn sau ngày mục tiêu.</p>}
      </section>

      <p className={hint}>Lợi suất là dự kiến, không cam kết. Tiền chuyển từ tài khoản mục tiêu sang tài sản của cùng mục tiêu.</p>

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid} onClick={() => setConfirm(true)}>
          Xem lại và xác nhận
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title="Xác nhận đầu tư"
        rows={rows}
        note={`Còn ${left} tháng đến ngày mục tiêu. Có ${daysBetween(today, goal.targetDate)} ngày để tiền sinh lời.`}
        confirmLabel="Đầu tư"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch({ type: "invest", goalId: goal.id, productId: product.id, amount: amount ?? 0, termMonths: chosenTerm?.months });
          backToGoalAssets(nav, goal.id);
        }}
      />
    </div>
  );
}
