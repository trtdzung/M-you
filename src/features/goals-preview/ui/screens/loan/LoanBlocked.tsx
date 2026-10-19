"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";
import {
  addMonths,
  affordability,
  annuityPayment,
  formatISODate,
  formatMonths,
  goalOptions,
  goalValue,
  MAX_DTI,
} from "../../../engine";
import type { ScreenProps } from "../../../model/screens";
import { Amount, BottomActions, ConfirmSheet, ScreenHeader, SummaryRows } from "../../shared";
import { card, errorBox, infoBox, listRow, primaryButton, screenPadding, divider } from "../../shared/styles";
import { DtiGauge, NotFoundScreen, Section, loanParamsFrom, pct, useLoanScreen } from "./shared";

/** Chưa thể vay: lý do, mức vay/kỳ hạn có thể qua, và phương án thay thế. */
export function LoanBlocked({ params }: ScreenProps) {
  const { state, dispatch, goal, nav, today } = useLoanScreen(params);
  const [sheet, setSheet] = useState<"extend" | "reduce" | null>(null);
  if (!goal) return <NotFoundScreen title="Chưa thể vay" onCta={() => nav.push("GoalList")} />;

  const { product, principal, termMonths, deposit } = loanParamsFrom(params, goal, state);
  const { monthlyIncome, existingDebtPayment } = state.customer;
  const payment = annuityPayment(principal, product.ratePa, termMonths);
  const check = affordability({ monthlyPayment: payment, monthlyIncome, existingDebtPayment, ratePa: product.ratePa, termMonths });

  // Longest term the product allows, in case a longer loan lets the same amount pass.
  const termStep = 12;
  let passTerm: number | null = null;
  for (let t = termMonths; t <= product.maxTermMonths; t += termStep) {
    const c = affordability({ monthlyPayment: annuityPayment(principal, product.ratePa, t), monthlyIncome, existingDebtPayment, ratePa: product.ratePa, termMonths: t });
    if (c.allowed) {
      passTerm = t;
      break;
    }
  }
  const maxAtTerm = Math.min(product.maxAmount, check.maxPrincipal);
  const canTrySmaller = maxAtTerm >= product.minAmount;

  const isDraft = goal.status === "draft";
  const opts = goalOptions(state, goal);
  const value = goalValue(state, goal).total;
  const base = goal.targetDate > today ? goal.targetDate : today;
  const extendDate = addMonths(base, 12);
  const reduceAmount = opts.reduce && opts.reduce.newTargetAmount > 0 && opts.reduce.newTargetAmount < goal.targetAmount
    ? opts.reduce.newTargetAmount
    : Math.floor(value / 1_000_000) * 1_000_000 > 0 && Math.floor(value / 1_000_000) * 1_000_000 < goal.targetAmount
      ? Math.floor(value / 1_000_000) * 1_000_000
      : null;

  const primary = canTrySmaller ? (
    <button
      type="button"
      className={primaryButton}
      onClick={() => nav.replace("LoanSimulator", { goalId: goal.id, productId: product.id, amount: Math.floor(maxAtTerm / 1_000_000) * 1_000_000, termMonths, deposit: isDraft ? deposit : undefined })}
    >
      Thử vay {formatVnd(Math.floor(maxAtTerm / 1_000_000) * 1_000_000)}
    </button>
  ) : (
    <button type="button" className={primaryButton} onClick={() => nav.push("OptionsCompare", { goalId: goal.id })}>
      So sánh các phương án khác
    </button>
  );

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Chưa thể vay" subtitle={goal.name} />

      <div className={errorBox}>
        <p className="font-semibold text-text">Khoản vay này đang quá sức với thu nhập hiện tại</p>
        <p className="mt-1 text-muted">
          Mỗi tháng bạn sẽ phải trả {formatVnd(payment)} cho khoản vay mới, cộng {formatVnd(existingDebtPayment)} nợ đang trả, tức {pct(check.dti)} thu nhập. MSB chỉ cho vay khi tổng này không quá {pct(MAX_DTI)} để bạn không bị áp lực tài chính.
        </p>
      </div>

      <div className={card}>
        <DtiGauge dti={check.dti} newPayment={payment} existingDebt={existingDebtPayment} income={monthlyIncome} />
      </div>

      <Section title="Điều gì sẽ vay được?">
        <SummaryRows
          rows={[
            { label: "Khoản bạn đang xem", value: `${formatVnd(principal)} · ${formatMonths(termMonths)}` },
            {
              label: `Vay tối đa trong ${formatMonths(termMonths)}`,
              value: canTrySmaller ? <Amount amount={maxAtTerm} source="estimated" /> : "Chưa đủ điều kiện",
              hint: `Trả tối đa ${formatVnd(check.maxMonthlyPayment)}/tháng`,
            },
            ...(passTerm
              ? [{ label: `Giữ ${formatVnd(principal)}, kéo dài kỳ hạn`, value: formatMonths(passTerm) }]
              : []),
          ]}
        />
        {!canTrySmaller && !passTerm && (
          <div className={infoBox}>Với thu nhập và nợ hiện tại, bạn chưa thể vay sản phẩm này. Các phương án bên dưới sẽ phù hợp hơn.</div>
        )}
      </Section>

      <Section title="Phương án khác">
        <div className={`${card} overflow-hidden p-0 ${divider}`}>
          <button type="button" className={listRow} onClick={() => nav.push("OptionsCompare", { goalId: goal.id })}>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-text">Tiết kiệm thêm mỗi tháng</span>
              <span className="block text-[13px] leading-5 text-muted">So sánh các cách bù phần thiếu mà không cần vay.</span>
            </span>
          </button>
          {!isDraft && (
          <button type="button" className={listRow} onClick={() => setSheet("extend")}>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-text">Lùi ngày thêm 12 tháng</span>
              <span className="block text-[13px] leading-5 text-muted">Ngày mới {formatISODate(extendDate)}, có thêm thời gian tích luỹ.</span>
            </span>
          </button>
          )}
          {!isDraft && reduceAmount !== null && (
            <button type="button" className={listRow} onClick={() => setSheet("reduce")}>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-text">Giảm mục tiêu xuống {formatVnd(reduceAmount)}</span>
                <span className="block text-[13px] leading-5 text-muted">Khớp với số tiền bạn có thể có được.</span>
              </span>
            </button>
          )}
        </div>
      </Section>

      <BottomActions>{primary}</BottomActions>

      <ConfirmSheet
        open={sheet === "extend"}
        title="Lùi ngày mục tiêu"
        rows={[
          { label: "Ngày hiện tại", value: formatISODate(goal.targetDate) },
          { label: "Ngày mới", value: formatISODate(extendDate), emphasis: true },
        ]}
        confirmLabel="Lùi ngày"
        onClose={() => setSheet(null)}
        onConfirm={() => {
          dispatch({ type: "extend", goalId: goal.id, newTargetDate: extendDate });
          nav.replace("GoalDetail", { goalId: goal.id });
        }}
      />
      <ConfirmSheet
        open={sheet === "reduce" && reduceAmount !== null}
        title="Giảm số tiền mục tiêu"
        rows={[
          { label: "Mục tiêu hiện tại", value: goal.targetAmount },
          { label: "Mục tiêu mới", value: reduceAmount ?? 0, emphasis: true },
        ]}
        confirmLabel="Giảm mục tiêu"
        onClose={() => setSheet(null)}
        onConfirm={() => {
          if (reduceAmount !== null) dispatch({ type: "reduceTarget", goalId: goal.id, newTargetAmount: reduceAmount });
          nav.replace("GoalDetail", { goalId: goal.id });
        }}
      />
    </div>
  );
}
