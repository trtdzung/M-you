"use client";

import { useState } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { requiredMonthly } from "../../../engine/feasibility";
import { nextDayOfMonth, formatISODate } from "../../../engine/dates";
import type { ScreenProps } from "../../../model/screens";
import { paramString } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { Amount } from "../../shared/Amount";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { EmptyState } from "../../shared/EmptyState";
import { MoneyInput } from "../../shared/MoneyInput";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { card, chip, chipSelected, ghostButton, hint, infoBox, input, label, primaryButton, screenPadding, sectionTitle } from "../../shared/styles";
import { WIZARD_STEPS } from "./wizard";

const QUICK_DAYS = [1, 5, 10, 15, 20, 25];

/** Bước 5b: trích tự động hằng tháng. Có thể bỏ qua. */
export function StandingOrderSetup({ params }: ScreenProps) {
  const { state, dispatch, nav } = usePreview();
  const goalId = paramString(params, "goalId");
  const goal = goalId ? state.goals.find((g) => g.id === goalId) : undefined;

  const suggested = goal ? requiredMonthly(state, goal) : 0;
  const salaryDay = Math.min(28, state.customer.salaryDay);
  const [amount, setAmount] = useState<number | null>(suggested > 0 ? suggested : null);
  const [day, setDay] = useState(Math.min(28, salaryDay + 1));
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  if (!goal || !goal.accountId) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Trích tự động" />
        <EmptyState title="Chưa có tài khoản mục tiêu" description="Hãy mở tài khoản trước khi cài đặt trích tự động." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const balance = state.customer.mainCasaBalance;
  const surplus = state.customer.monthlySurplus;
  const exceedsSurplus = amount !== null && surplus !== "unknown" && amount > surplus;
  const error = touched && !amount ? "Hãy nhập số tiền trích mỗi tháng." : undefined;
  const nextRun = nextDayOfMonth(state.clock.today, day);
  const finish = () => nav.replace("CreateSuccess", { goalId: goal.id });

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Trích tự động hằng tháng" subtitle={goal.name} hideBack />
      <StepProgress steps={WIZARD_STEPS} current={4} />
      <p className={infoBox}>Tài khoản mục tiêu đã mở. Cài trích tự động giúp bạn tiết kiệm đều mà không phải nhớ.</p>

      <MoneyInput
        label="Số tiền trích mỗi tháng"
        value={amount}
        onChange={setAmount}
        error={error}
        hint={suggested > 0 ? `Gợi ý ${formatVnd(suggested)} để kịp mục tiêu đúng hạn.` : "Bạn có thể đổi bất cứ lúc nào."}
        quickAmounts={suggested > 0 ? [suggested] : undefined}
      />
      {exceedsSurplus && (
        <p className="rounded-2xl bg-warning-soft px-3.5 py-3 text-sm text-text">
          Số này lớn hơn số dư hằng tháng ước tính của bạn ({formatVnd(typeof surplus === "number" ? surplus : 0)}). Nếu tài khoản chính không đủ, lệnh trích sẽ không thực hiện được.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className={label}>Trích vào ngày nào mỗi tháng?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ngày trích">
          {[...new Set([Math.min(28, salaryDay + 1), ...QUICK_DAYS])].sort((a, b) => a - b).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={day === d} className={day === d ? chipSelected : chip} onClick={() => setDay(d)}>
              {d}
              {d === Math.min(28, salaryDay + 1) ? " · sau lương" : ""}
            </button>
          ))}
        </div>
        <select aria-label="Chọn ngày khác" className={input} value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              Ngày {d}
            </option>
          ))}
        </select>
        <p className={hint}>Bạn nhận lương ngày {state.customer.salaryDay}, nên trích ngay sau đó sẽ ít bị thiếu tiền hơn.</p>
      </div>

      <section className={`${card} flex flex-col gap-1`}>
        <h2 className={sectionTitle}>Nguồn tiền</h2>
        <p className="text-sm text-text">Tài khoản chính {state.customer.mainCasaNumber}</p>
        <p className="text-[13px] text-muted">
          Số dư hiện tại: <Amount amount={balance} source="msb" />
        </p>
        <p className="text-[13px] text-muted">Lần trích đầu tiên: {formatISODate(nextRun)}</p>
      </section>

      <BottomActions>
        <button
          type="button"
          className={primaryButton}
          onClick={() => {
            setTouched(true);
            if (amount) setOpen(true);
          }}
        >
          Cài trích tự động
        </button>
        <button type="button" className={`${ghostButton} self-center`} onClick={finish}>
          Để sau, tôi tự nạp tiền
        </button>
      </BottomActions>

      <ConfirmSheet
        open={open}
        title="Xác nhận trích tự động"
        rows={[
          { label: "Từ tài khoản", value: `Chính ${state.customer.mainCasaNumber}` },
          { label: "Đến", value: goal.name },
          { label: "Ngày mỗi tháng", value: `Ngày ${day}` },
          { label: "Lần đầu", value: formatISODate(nextRun) },
          { label: "Số tiền mỗi tháng", value: amount ?? 0, emphasis: true },
        ]}
        confirmLabel="Xác nhận"
        onConfirm={() => {
          dispatch({ type: "setStandingOrder", goalId: goal.id, amount: amount ?? 0, dayOfMonth: day });
          finish();
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
