"use client";

import { useState } from "react";
import { formatVnd, maskAccountNumber } from "@/lib/format";
import { TEMPLATE_LABEL } from "../../../model/labels";
import { addMonths, buildSchedule, formatISODate, formatMonths, quoteLoan, totalInterest } from "../../../engine";
import { paramNumber, type ScreenProps } from "../../../model/screens";
import { BottomActions, ConfirmSheet, ScreenHeader, SummaryRows } from "../../shared";
import { errorBox, infoBox, primaryButton, ring, screenPadding } from "../../shared/styles";
import { INDICATIVE_NOTE, NotFoundScreen, Section, loanParamsFrom, useLoanScreen } from "./shared";

/** Đăng ký vay (mô phỏng): hồ sơ điền sẵn, đồng ý điều khoản, xác nhận → giải ngân. */
export function LoanApply({ params }: ScreenProps) {
  const { state, dispatch, goal, account, nav, today } = useLoanScreen(params);
  const [agreed, setAgreed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!goal) return <NotFoundScreen title="Đăng ký vay" onCta={() => nav.push("GoalList")} />;

  const { product, principal, termMonths } = loanParamsFrom(params, goal, state);
  const quote = quoteLoan(state, { productId: product.id, principal, ratePa: product.ratePa, termMonths, startDate: today });
  const totalInt = totalInterest(buildSchedule(principal, product.ratePa, termMonths, today));
  const allowed = quote.affordability.allowed;
  const accountText = account ? `${account.name} · ${maskAccountNumber(account.number)}` : "Tài khoản mục tiêu";

  const isDraft = goal.status === "draft";
  const confirm = () => {
    dispatch({ type: "takeLoan", goalId: goal.id, productId: product.id, principal, termMonths });
    nav.replace("AchievedIntro", { goalId: goal.id });
  };

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Đăng ký vay" subtitle="Hồ sơ đã được điền sẵn từ dữ liệu của bạn" />

      {!allowed && (
        <div className={errorBox}>
          Khoản trả hằng tháng vượt 40% thu nhập nên chưa thể đăng ký. Hãy điều chỉnh khoản vay.
        </div>
      )}

      <Section title="Thông tin khoản vay">
        <SummaryRows
          rows={[
            { label: "Sản phẩm", value: product.name },
            { label: "Số tiền vay", value: principal, source: "msb", emphasis: true },
            { label: "Kỳ hạn", value: formatMonths(termMonths) },
            { label: "Lãi suất tham khảo", value: `${product.ratePa}%/năm` },
            { label: "Trả mỗi tháng", value: quote.monthlyPayment, source: "estimated" },
            { label: "Tổng lãi", value: totalInt, source: "estimated" },
            { label: "Kỳ trả đầu tiên", value: formatISODate(addMonths(today, 1)) },
          ]}
        />
      </Section>

      <Section title="Giải ngân và mục đích">
        <SummaryRows
          rows={[
            { label: "Tiền giải ngân vào", value: accountText },
            { label: "Mục đích", value: `${TEMPLATE_LABEL[goal.template]}: ${goal.name}` },
            { label: "Người vay", value: `${state.customer.name} · CIF ${state.customer.cif}` },
            { label: "Thu nhập tháng", value: state.customer.monthlyIncome, source: "msb" },
          ]}
        />
        <div className={infoBox}>
          Tiền vay vào tài khoản mục tiêu cùng phần bạn đã tích luỹ, dùng thanh toán cho “{goal.name}”. Sau đó tài khoản này tự trả nợ hằng tháng.
        </div>
      </Section>

      <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface px-3.5 py-3 ${ring}`}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
        />
        <span className="text-sm leading-5 text-text">
          Tôi đã đọc và đồng ý với điều khoản khoản vay, và cho phép MSB tự trích tài khoản mục tiêu để trả nợ mỗi kỳ.
        </span>
      </label>

      <p className="text-[12px] leading-4 text-muted">{INDICATIVE_NOTE}</p>

      <BottomActions>
        {isDraft ? (
          <button type="button" className={primaryButton} onClick={() => nav.push("OpenAccountConfirm", { goalId: goal.id, productId: product.id, amount: principal, termMonths, deposit: paramNumber(params, "deposit") })}>
            Đưa vào kế hoạch
          </button>
        ) : allowed ? (
          <button type="button" className={primaryButton} disabled={!agreed} onClick={() => setConfirming(true)}>
            Gửi đăng ký vay
          </button>
        ) : (
          <button type="button" className={primaryButton} onClick={() => nav.replace("LoanBlocked", { goalId: goal.id, productId: product.id, amount: principal, termMonths })}>
            Xem vì sao chưa vay được
          </button>
        )}
      </BottomActions>

      <ConfirmSheet
        open={confirming}
        title="Xác nhận vay"
        description="Kiểm tra lại trước khi gửi đăng ký."
        rows={[
          { label: "Số tiền vay", value: principal, emphasis: true },
          { label: "Kỳ hạn", value: formatMonths(termMonths) },
          { label: "Trả mỗi tháng", value: quote.monthlyPayment },
          { label: "Giải ngân vào", value: accountText },
        ]}
        note={`Khoản vay ${formatVnd(principal)} được giải ngân ngay và mục tiêu chuyển sang trạng thái Đạt mục tiêu.`}
        confirmLabel="Xác nhận vay"
        onClose={() => setConfirming(false)}
        onConfirm={confirm}
      />
    </div>
  );
}
