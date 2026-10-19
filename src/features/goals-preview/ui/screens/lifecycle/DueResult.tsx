"use client";

import { useState } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { daysToTarget, formatISODate, goalValue } from "../../../engine";
import type { ScreenProps } from "../../../model/screens";
import { Amount, BottomActions, ConfirmSheet, GoalStatusBadge, ScreenHeader, SplitProgressBar } from "../../shared";
import { card, infoBox, primaryButton, screenPadding, secondaryButton, successBox } from "../../shared/styles";
import { NotFoundScreen, loanGap, probeLoan, useLoanScreen } from "../loan/shared";

/** Kết quả đến hạn: đủ tiền / thiếu (vay được) / thiếu (không vay được) / đạt sớm. */
export function DueResult({ params }: ScreenProps) {
  const { state, dispatch, goal, nav, today } = useLoanScreen(params);
  const [confirmEarly, setConfirmEarly] = useState(false);
  if (!goal) return <NotFoundScreen title="Kết quả đến hạn" onCta={() => nav.push("GoalList")} />;

  const value = goalValue(state, goal);
  const header = <ScreenHeader title="Kết quả đến hạn" subtitle={goal.name} />;
  const progress = (
    <div className={card}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Bạn đã có</p>
          <Amount amount={value.total} source={value.source} className="text-[22px] font-bold" />
        </div>
        <GoalStatusBadge status={goal.status} />
      </div>
      <p className="mb-3 mt-1 text-[13px] text-muted">Mục tiêu {formatVnd(goal.targetAmount)} · hạn {formatISODate(goal.targetDate)}</p>
      <SplitProgressBar cash={value.cash} assets={value.assets} target={goal.targetAmount} />
    </div>
  );

  // 1) Đạt sớm, chưa hoàn thành.
  if (goal.status === "accumulating" && goal.reachedEarlyAt && value.total >= goal.targetAmount) {
    return (
      <div className={screenPadding}>
        {header}
        <div className={successBox}>
          <p className="text-[17px] font-bold text-text">Bạn đã đủ tiền từ {formatISODate(goal.reachedEarlyAt)}</p>
          <p className="mt-1 text-muted">Sớm hơn hạn {formatISODate(goal.targetDate)} {Math.max(0, daysToTarget(goal, today))} ngày. Bạn có thể hoàn thành ngay hoặc tiếp tục tích luỹ.</p>
        </div>
        {progress}
        <BottomActions>
          <button type="button" className={primaryButton} onClick={() => setConfirmEarly(true)}>
            Hoàn thành ngay
          </button>
          <button type="button" className={secondaryButton} onClick={() => nav.replace("GoalDetail", { goalId: goal.id })}>
            Tiếp tục tích luỹ
          </button>
        </BottomActions>
        <ConfirmSheet
          open={confirmEarly}
          title="Hoàn thành mục tiêu sớm"
          rows={[
            { label: "Mục tiêu", value: goal.name },
            { label: "Giá trị hiện có", value: value.total, source: value.source, emphasis: true },
            { label: "Hạn ban đầu", value: formatISODate(goal.targetDate) },
          ]}
          note="Trích tự động sẽ dừng. Tiền vẫn nằm trong tài khoản mục tiêu để bạn rút khi cần."
          confirmLabel="Hoàn thành ngay"
          onClose={() => setConfirmEarly(false)}
          onConfirm={() => {
            dispatch({ type: "completeEarly", goalId: goal.id });
            nav.replace("CompletedCelebration", { goalId: goal.id });
          }}
        />
      </div>
    );
  }

  // 2) Đủ tiền, đã hoàn thành.
  if (goal.status === "completed") {
    return (
      <div className={screenPadding}>
        {header}
        <div className={successBox}>
          <p className="text-[17px] font-bold text-text">Chúc mừng, bạn đã đủ tiền!</p>
          <p className="mt-1 text-muted">Mục tiêu đã hoàn thành. Cùng nhìn lại hành trình của bạn.</p>
        </div>
        {progress}
        <BottomActions>
          <button type="button" className={primaryButton} onClick={() => nav.replace("CompletedCelebration", { goalId: goal.id })}>
            Xem hành trình
          </button>
        </BottomActions>
      </div>
    );
  }

  // 3) Đến hạn, còn thiếu.
  if (goal.status === "missed" || (goal.status === "accumulating" && today >= goal.targetDate)) {
    const gap = loanGap(state, goal);
    const probe = probeLoan(state, goal);
    if (!probe.possible) {
      return (
        <div className={screenPadding}>
          {header}
          <div className={infoBox}>
            <p className="text-[17px] font-bold text-text">Mục tiêu chưa đủ tiền, và đó là điều bình thường</p>
            <p className="mt-1 text-muted">
              Bạn còn thiếu {formatVnd(gap)}. Với thu nhập hiện tại, khoản vay bù phần thiếu này chưa phù hợp. Có những cách nhẹ nhàng hơn để tiếp tục.
            </p>
          </div>
          {progress}
          <BottomActions>
            <button type="button" className={primaryButton} onClick={() => nav.push("MissedOptions", { goalId: goal.id })}>
              Xem các lựa chọn
            </button>
          </BottomActions>
        </div>
      );
    }
    return (
      <div className={screenPadding}>
        {header}
        <div className={infoBox}>
          <p className="text-[17px] font-bold text-text">Còn thiếu {formatVnd(gap)} so với mục tiêu</p>
          <p className="mt-1 text-muted">
            Bạn có 3 hướng: vay phần thiếu để đạt mục tiêu ngay, lùi ngày để tích luỹ thêm, hoặc giảm số tiền mục tiêu. Vay là phương án cuối.
          </p>
        </div>
        {progress}
        <p className="text-[13px] leading-5 text-muted">
          Nếu vay {formatVnd(probe.principal)} trong {probe.termMonths} tháng, bạn trả khoảng {formatVnd(probe.quote.monthlyPayment)}/tháng (số tham khảo).
        </p>
        <BottomActions>
          <button type="button" className={primaryButton} onClick={() => nav.push("LoanSimulator", { goalId: goal.id })}>
            Vay phần còn thiếu
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondaryButton} onClick={() => nav.push("MissedOptions", { goalId: goal.id, focus: "extend" })}>
              Gia hạn
            </button>
            <button type="button" className={secondaryButton} onClick={() => nav.push("MissedOptions", { goalId: goal.id, focus: "reduce" })}>
              Giảm mục tiêu
            </button>
          </div>
        </BottomActions>
      </div>
    );
  }

  // 4) Chưa đến hạn / trạng thái khác.
  return (
    <div className={screenPadding}>
      {header}
      <div className={infoBox}>
        {goal.status === "accumulating"
          ? `Chưa đến hạn. Còn ${Math.max(0, daysToTarget(goal, today))} ngày nữa đến ${formatISODate(goal.targetDate)}.`
          : "Mục tiêu này không có kết quả đến hạn cần xử lý."}
      </div>
      {progress}
      <BottomActions>
        <button type="button" className={primaryButton} onClick={() => nav.replace("GoalDetail", { goalId: goal.id })}>
          Về chi tiết mục tiêu
        </button>
      </BottomActions>
    </div>
  );
}
