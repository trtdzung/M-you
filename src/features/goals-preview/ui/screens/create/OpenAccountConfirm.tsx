"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { formatISODate, monthsLeft, nextDayOfMonth } from "../../../engine/dates";
import type { ScreenProps } from "../../../model/screens";
import type { Goal } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { MoneyInput } from "../../shared/MoneyInput";
import { DayOfMonthPicker, Switch } from "../../shared/Pickers";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { card, errorBox, primaryButton, screenPadding, sectionTitle } from "../../shared/styles";
import { DraftGuard, WIZARD_STEPS, formatAccountNumber, previewAccountNumber, wizardDeposit } from "./wizard";

const INTEREST_RATE_PA = 0.5;
const WITHDRAW_RULES =
  "Rút về tài khoản chính bất cứ lúc nào, không mất phí. Rút trước khi đạt mục tiêu sẽ làm kế hoạch chậm lại, ứng dụng báo rõ mức ảnh hưởng. Tiền nhàn rỗi có thể được gợi ý chuyển sang sản phẩm sinh lời, bạn luôn là người quyết định.";

/** Bước 3 · Mở tài khoản: tóm tắt kế hoạch, trích tự động (bật sẵn) và xác nhận mở. */
export function OpenAccountConfirm({ params }: ScreenProps) {
  return (
    <DraftGuard params={params} title="Mở tài khoản mục tiêu">
      {(goal) => <Body goal={goal} deposit={wizardDeposit(params)} />}
    </DraftGuard>
  );
}

function Body({ goal, deposit }: { goal: Goal; deposit: number }) {
  const { state, dispatch, nav } = usePreview();
  const [open, setOpen] = useState(false);
  const balance = state.customer.mainCasaBalance;
  const insufficient = deposit > balance;
  const accountNumber = previewAccountNumber(state);
  const accountName = `TK mục tiêu – ${goal.name}`;

  const left = monthsLeft(state.clock.today, goal.targetDate);
  const toSave = Math.max(0, goal.targetAmount - deposit);
  const monthly = toSave > 0 && left > 0 ? Math.ceil(toSave / left / 1000) * 1000 : 0;
  const [autoOn, setAutoOn] = useState(monthly > 0);
  const [autoAmount, setAutoAmount] = useState<number | null>(monthly > 0 ? monthly : null);
  const [day, setDay] = useState(Math.min(28, state.customer.salaryDay + 1));
  const autoValid = !autoOn || (autoAmount ?? 0) > 0;

  const confirm = () => {
    dispatch({ type: "openAccount", goalId: goal.id, initialDeposit: deposit });
    if (autoOn && autoAmount) dispatch({ type: "setStandingOrder", goalId: goal.id, amount: autoAmount, dayOfMonth: day });
    nav.replace("CreateSuccess", { goalId: goal.id });
  };

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Mở tài khoản mục tiêu" subtitle={goal.name} />
      <StepProgress steps={WIZARD_STEPS} current={2} />

      <section className={`${card} flex flex-col gap-3`} aria-label="Tóm tắt kế hoạch">
        <h2 className={sectionTitle}>Kế hoạch của bạn</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {[
            { label: "Mục tiêu", value: formatVndCompact(goal.targetAmount) },
            { label: "Đạt vào", value: formatISODate(goal.targetDate) },
            { label: "Nạp ban đầu", value: formatVndCompact(deposit) },
            { label: "Góp mỗi tháng", value: formatVndCompact(monthly) },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-[13px] text-muted">{row.label}</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-text">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${card} flex flex-col gap-3`} aria-label="Trích tự động">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <h2 className={sectionTitle}>Trích tự động hằng tháng</h2>
            <InfoTooltip label="trích tự động" text="Tự chuyển từ tài khoản chính vào tài khoản mục tiêu mỗi tháng. Đổi hoặc tạm dừng bất cứ lúc nào trong chi tiết mục tiêu." />
          </div>
          <Switch checked={autoOn} onChange={setAutoOn} label="Bật trích tự động" />
        </div>
        {autoOn && (
          <>
            <MoneyInput label="Số tiền mỗi tháng" value={autoAmount} onChange={setAutoAmount} error={autoValid ? undefined : "Hãy nhập số tiền trích mỗi tháng."} />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text">Vào ngày</span>
              <DayOfMonthPicker value={day} onChange={setDay} />
              <p className="text-[13px] text-muted">Lần đầu: {formatISODate(nextDayOfMonth(state.clock.today, day))}</p>
            </div>
          </>
        )}
      </section>

      <section className={`${card} flex flex-col gap-2`} aria-label="Tài khoản mục tiêu">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
            <Landmark size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h2 className={sectionTitle}>Tài khoản mục tiêu</h2>
              <InfoTooltip label="quy tắc rút tiền" text={WITHDRAW_RULES} />
            </div>
            <p className="text-[13px] text-muted">
              <span className="tabular-nums">{formatAccountNumber(accountNumber)}</span> · lãi {INTEREST_RATE_PA.toString().replace(".", ",")}%/năm
            </p>
          </div>
        </div>
      </section>

      {insufficient && (
        <p className={errorBox}>
          Số dư tài khoản chính ({formatVnd(balance)}) không đủ để nạp {formatVnd(deposit)}. Hãy quay lại bước trước để giảm số tiền.
        </p>
      )}

      <BottomActions inline>
        <button type="button" className={primaryButton} disabled={insufficient || !autoValid} onClick={() => setOpen(true)}>
          Mở tài khoản
        </button>
      </BottomActions>

      <ConfirmSheet
        open={open}
        title="Xác nhận mở tài khoản"
        description={deposit > 0 ? `Chuyển ${formatVnd(deposit)} từ tài khoản chính vào tài khoản mục tiêu.` : "Tài khoản được mở với số dư 0 đồng."}
        rows={[
          { label: "Tài khoản", value: accountName },
          { label: "Nạp ban đầu", value: deposit, emphasis: true, hint: deposit > 0 ? `Tài khoản chính còn ${formatVnd(balance - deposit)}` : undefined },
          { label: "Trích tự động", value: autoOn && autoAmount ? `${formatVnd(autoAmount)} · ngày ${day} hằng tháng` : "Không bật" },
        ]}
        confirmLabel="Xác nhận mở"
        onConfirm={confirm}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
