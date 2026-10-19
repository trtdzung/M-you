"use client";

import { useState } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { daysBetween, formatISODate, outstandingPrincipal } from "../../../engine";
import { LOAN_ROW_LABEL } from "../../../model/labels";
import type { ScreenProps } from "../../../model/screens";
import { Amount, BottomActions, ConfirmSheet, GoalStatusBadge, ScreenHeader, SummaryRows } from "../../shared";
import { card, divider, errorBox, listRow, primaryButton, progressTrack, screenPadding, successBox, warningBox, calloutTitle, heroNumber } from "../../shared/styles";
import { NotFoundScreen, Section, pct, useLoanScreen } from "../loan/shared";

/** Tích luỹ & trả nợ: dư nợ, kỳ tới, quá hạn, và các lối đi (lịch trả, trả trước). */
export function RepayOverview({ params }: ScreenProps) {
  const { dispatch, goal, account, loan, nav, today } = useLoanScreen(params);
  const [confirming, setConfirming] = useState(false);
  if (!goal) return <NotFoundScreen title="Tích luỹ & trả nợ" onCta={() => nav.push("GoalList")} />;
  const header = <ScreenHeader title="Tích luỹ & trả nợ" subtitle={goal.name} />;
  if (!loan) {
    return (
      <div className={screenPadding}>
        {header}
        <div className={warningBox}>Mục tiêu này chưa có khoản vay.</div>
      </div>
    );
  }

  if (loan.status === "paid_off") {
    return (
      <div className={screenPadding}>
        {header}
        <div className={successBox}>
          <p className={calloutTitle}>Bạn đã trả hết nợ</p>
          <p className="mt-1 text-muted">Khoản vay {formatVnd(loan.principal)} đã tất toán.</p>
        </div>
        <BottomActions>
          <button type="button" className={primaryButton} onClick={() => nav.replace("CompletedCelebration", { goalId: goal.id })}>
            Xem hành trình
          </button>
        </BottomActions>
      </div>
    );
  }

  const outstanding = outstandingPrincipal(loan.schedule);
  const repaidPct = loan.principal > 0 ? Math.max(0, Math.min(1, 1 - outstanding / loan.principal)) : 0;
  const next = loan.schedule.find((r) => r.status !== "paid");
  const overdueRows = loan.schedule.filter((r) => r.status === "overdue");
  const overdue = overdueRows.length > 0;
  const cash = account?.balance ?? 0;
  const enough = next ? cash >= next.payment : true;
  const shortfall = next ? Math.max(0, next.payment - cash) : 0;
  const payoff = loan.schedule[loan.schedule.length - 1]?.dueDate;
  const daysToNext = next ? daysBetween(today, next.dueDate) : 0;

  const primary = overdue && enough ? (
    <button type="button" className={primaryButton} onClick={() => setConfirming(true)}>
      Trả ngay {next ? formatVnd(next.payment) : ""}
    </button>
  ) : !enough ? (
    <button type="button" className={primaryButton} onClick={() => nav.push("DepositFlow", { goalId: goal.id, amount: shortfall })}>
      Nạp thêm {formatVnd(shortfall)}
    </button>
  ) : (
    <button type="button" className={primaryButton} onClick={() => nav.push("Prepay", { goalId: goal.id, loanId: loan.id })}>
      Trả trước để giảm lãi
    </button>
  );

  return (
    <div className={screenPadding}>
      {header}

      {overdue && (
        <div className={errorBox} role="alert">
          <p className="font-semibold text-negative">Có {overdueRows.length} kỳ nợ quá hạn</p>
          <p className="mt-1 text-muted">
            Kỳ {overdueRows[0].period} đáng lẽ trả ngày {formatISODate(overdueRows[0].dueDate)}. {enough ? "Tài khoản mục tiêu đã đủ tiền, hãy trả ngay để tránh phát sinh lãi quá hạn." : "Hãy nạp thêm tiền rồi trả sớm nhất có thể."}
          </p>
        </div>
      )}

      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Dư nợ gốc còn lại</p>
            <Amount amount={outstanding} source="msb" className={heroNumber} />
          </div>
          <GoalStatusBadge status={goal.status} />
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(repaidPct * 100)}
          aria-label={`Đã trả ${pct(repaidPct)} khoản vay`}
          className={`${progressTrack} mt-3`}
        >
          <div className="absolute inset-y-0 left-0 bg-positive" style={{ width: `${repaidPct * 100}%` }} />
        </div>
        <p className="mt-1.5 text-[12px] leading-4 text-muted">
          Đã trả {pct(repaidPct)} của khoản vay {formatVnd(loan.principal)}
        </p>
      </section>

      {next && (
        <Section title={overdue ? "Kỳ cần trả" : "Kỳ trả tiếp theo"}>
          <SummaryRows
            rows={[
              { label: `Kỳ ${next.period} · ${LOAN_ROW_LABEL[next.status]}`, value: formatISODate(next.dueDate), hint: !overdue && daysToNext >= 0 ? `Còn ${daysToNext} ngày` : undefined },
              { label: "Số tiền", value: next.payment, source: "msb", emphasis: true },
              { label: "Tài khoản mục tiêu đang có", value: cash, source: "msb" },
            ]}
          />
          {enough ? (
            <div className={successBox}>Tài khoản mục tiêu đủ tiền, MSB sẽ tự trừ vào ngày đến hạn.</div>
          ) : (
            <div className={warningBox}>
              Tài khoản mục tiêu còn thiếu {formatVnd(shortfall)} cho kỳ này. Nạp thêm để không bị quá hạn.
            </div>
          )}
        </Section>
      )}

      <SummaryRows
        rows={[
          { label: "Trả mỗi tháng", value: loan.monthlyPayment, source: "msb" },
          { label: "Dự kiến tất toán", value: formatISODate(payoff), hint: `${loan.schedule.filter((r) => r.status !== "paid").length} kỳ còn lại` },
        ]}
      />

      <div className={`${card} overflow-hidden p-0 ${divider}`}>
        <button type="button" className={listRow} onClick={() => nav.push("RepaySchedule", { goalId: goal.id, loanId: loan.id })}>
          <span className="flex-1 text-[15px] font-semibold text-text">Xem lịch trả nợ</span>
        </button>
        <button
          type="button"
          className={`${listRow} disabled:opacity-50`}
          disabled={overdue}
          onClick={() => nav.push("Prepay", { goalId: goal.id, loanId: loan.id })}
        >
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-text">Trả trước một phần nợ gốc</span>
            <span className="block text-[13px] leading-5 text-muted">
              {overdue ? "Hãy trả kỳ quá hạn trước khi trả trước." : "Giảm lãi và số tiền phải trả mỗi tháng."}
            </span>
          </span>
        </button>
      </div>

      <BottomActions>{primary}</BottomActions>

      <ConfirmSheet
        open={confirming && !!next}
        title="Trả kỳ nợ"
        rows={[
          { label: "Kỳ", value: next ? `Kỳ ${next.period}` : "" },
          { label: "Gốc", value: next?.principal ?? 0 },
          { label: "Lãi", value: next?.interest ?? 0 },
          { label: "Tổng trả", value: next?.payment ?? 0, emphasis: true },
        ]}
        note="Tiền được trừ từ tài khoản mục tiêu."
        confirmLabel="Trả ngay"
        onClose={() => setConfirming(false)}
        onConfirm={() => dispatch({ type: "repay", loanId: loan.id })}
      />
    </div>
  );
}
