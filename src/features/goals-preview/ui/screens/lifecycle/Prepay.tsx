"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";
import { addMonths, buildSchedule, annuityPayment, formatISODate, outstandingPrincipal, totalInterest } from "../../../engine";
import type { ScreenProps } from "../../../model/screens";
import { BottomActions, ConfirmSheet, MoneyInput, ScreenHeader, SummaryRows } from "../../shared";
import { errorBox, infoBox, primaryButton, screenPadding, secondaryButton, warningBox } from "../../shared/styles";
import { NotFoundScreen, Section, useLoanScreen } from "../loan/shared";

/** Trả trước một phần nợ gốc: mô phỏng đúng cách store tính lại lịch trả. */
export function Prepay({ params }: ScreenProps) {
  const { dispatch, goal, account, loan, nav, today } = useLoanScreen(params);
  const [amount, setAmount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (!goal) return <NotFoundScreen title="Trả nợ trước hạn" onCta={() => nav.push("GoalList")} />;
  const header = <ScreenHeader title="Trả nợ trước hạn" subtitle={goal.name} />;
  if (!loan || loan.status !== "active") {
    return (
      <div className={screenPadding}>
        {header}
        <div className={warningBox}>Không có khoản vay đang hoạt động để trả trước.</div>
      </div>
    );
  }

  const overdue = loan.schedule.some((r) => r.status === "overdue");
  if (overdue) {
    return (
      <div className={screenPadding}>
        {header}
        <div className={errorBox}>
          <p className="font-semibold text-negative">Chưa thể trả trước</p>
          <p className="mt-1 text-muted">Bạn đang có kỳ nợ quá hạn. Hãy trả kỳ quá hạn trước, sau đó mới trả trước nợ gốc.</p>
        </div>
        <BottomActions>
          <button type="button" className={primaryButton} onClick={() => nav.pop()}>
            Quay lại để trả kỳ quá hạn
          </button>
        </BottomActions>
      </div>
    );
  }

  const cash = account?.balance ?? 0;
  const outstanding = outstandingPrincipal(loan.schedule);
  const max = Math.min(cash, outstanding);
  const value = Math.min(amount ?? 0, max);
  const unpaid = loan.schedule.filter((r) => r.status !== "paid");
  const left = outstanding - value;
  const payoffNow = value > 0 && left <= 0;
  const currentInterest = totalInterest(unpaid);
  const newRows =
    value > 0 && left > 0 ? buildSchedule(left, loan.ratePa, unpaid.length, addMonths(unpaid[0].dueDate, -1), unpaid[0].period) : [];
  const newInterest = value > 0 ? (left > 0 ? totalInterest(newRows) : 0) : currentInterest;
  const saved = Math.max(0, currentInterest - newInterest);
  const newPayment = value > 0 && left > 0 ? annuityPayment(left, loan.ratePa, unpaid.length) : value > 0 ? 0 : loan.monthlyPayment;
  const payoffDate = unpaid[unpaid.length - 1]?.dueDate;
  const canSubmit = value > 0 && value <= max;

  return (
    <div className={screenPadding}>
      {header}
      <div className={infoBox}>
        Trả trước một phần nợ gốc giúp giảm tổng lãi. Khoản trả mỗi tháng sẽ nhỏ đi, số kỳ còn lại giữ nguyên.
      </div>

      <SummaryRows
        rows={[
          { label: "Dư nợ gốc hiện tại", value: outstanding, source: "msb" },
          { label: "Tài khoản mục tiêu đang có", value: cash, source: "msb" },
        ]}
      />

      <MoneyInput
        label="Số tiền trả trước"
        value={amount}
        onChange={setAmount}
        max={max}
        quickAmounts={[10_000_000, 20_000_000, 50_000_000].filter((q) => q < max)}
        hint={max <= 0 ? "Tài khoản mục tiêu chưa có tiền, hãy nạp thêm." : `Tối đa ${formatVnd(max)} (số dư hiện có hoặc dư nợ).`}
      />

      <Section title="Sau khi trả trước">
        <SummaryRows
          rows={[
            { label: "Dư nợ gốc còn lại", value: Math.max(0, left), source: "estimated" },
            { label: "Trả mỗi tháng", value: newPayment, source: "estimated", hint: value > 0 && !payoffNow ? `Giảm ${formatVnd(Math.max(0, loan.monthlyPayment - newPayment))}` : undefined },
            { label: "Lãi tiết kiệm được", value: saved, source: "estimated", emphasis: true },
            { label: "Ngày tất toán", value: payoffNow ? formatISODate(today) : formatISODate(payoffDate), hint: payoffNow ? "Tất toán ngay, rút ngắn " + unpaid.length + " tháng" : "Không đổi" },
          ]}
        />
        <p className="text-[12px] leading-4 text-muted">
          Bản mô phỏng không tính phí trả trước hạn. Thực tế phí (nếu có) theo hợp đồng vay của MSB.
        </p>
      </Section>

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!canSubmit} onClick={() => setConfirming(true)}>
          Trả trước {value > 0 ? formatVnd(value) : ""}
        </button>
        {max <= 0 && (
          <button type="button" className={secondaryButton} onClick={() => nav.push("DepositFlow", { goalId: goal.id })}>
            Nạp tiền vào mục tiêu
          </button>
        )}
      </BottomActions>

      <ConfirmSheet
        open={confirming && canSubmit}
        title="Xác nhận trả trước"
        rows={[
          { label: "Số tiền trả trước", value: value, emphasis: true },
          { label: "Lãi tiết kiệm được", value: saved },
          { label: "Trả mỗi tháng sau đó", value: newPayment },
        ]}
        note="Tiền được trừ từ tài khoản mục tiêu."
        confirmLabel="Trả trước"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          dispatch({ type: "prepay", loanId: loan.id, amount: value });
          nav.pop();
        }}
      />
    </div>
  );
}
