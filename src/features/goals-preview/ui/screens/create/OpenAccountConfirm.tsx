"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { formatISODate } from "../../../engine/dates";
import type { ScreenProps } from "../../../model/screens";
import type { Goal } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { SummaryRows } from "../../shared/SummaryRows";
import { card, errorBox, primaryButton, screenPadding, sectionTitle } from "../../shared/styles";
import { DraftGuard, WIZARD_STEPS, formatAccountNumber, previewAccountNumber, wizardDeposit } from "./wizard";

const INTEREST_RATE_PA = 0.5;

/** Bước 5a: xem lại Tài khoản mục tiêu và xác nhận mở. */
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

  const rows = [
    { label: "Tên tài khoản", value: accountName },
    { label: "Số tài khoản (dự kiến)", value: <span className="tabular-nums">{formatAccountNumber(accountNumber)}</span> },
    { label: "Lãi suất không kỳ hạn", value: `${INTEREST_RATE_PA.toString().replace(".", ",")}%/năm` },
    { label: "Mục tiêu", value: `${formatVnd(goal.targetAmount)} · ${formatISODate(goal.targetDate)}` },
    { label: "Nạp ban đầu", value: deposit, emphasis: true },
  ];

  const confirm = () => {
    dispatch({ type: "openAccount", goalId: goal.id, initialDeposit: deposit });
    nav.replace("StandingOrderSetup", { goalId: goal.id });
  };

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Mở tài khoản mục tiêu" subtitle={goal.name} />
      <StepProgress steps={WIZARD_STEPS} current={4} />

      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
            <Landmark size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className={sectionTitle}>Tài khoản mục tiêu</h2>
            <p className="text-[13px] text-muted">Một tài khoản riêng chỉ để dành cho “{goal.name}”.</p>
          </div>
        </div>
        <SummaryRows rows={rows} />
      </section>

      <section className={`${card} flex flex-col gap-2`}>
        <h2 className={sectionTitle}>Quy tắc rút tiền</h2>
        <ul className="list-disc pl-5 text-sm leading-6 text-text">
          <li>Bạn rút được bất cứ lúc nào về tài khoản chính, không mất phí.</li>
          <li>Rút trước khi đạt mục tiêu sẽ làm kế hoạch chậm lại, ứng dụng sẽ báo rõ mức ảnh hưởng.</li>
          <li>Tiền nhàn rỗi có thể được gợi ý chuyển sang sản phẩm sinh lời, bạn luôn là người quyết định.</li>
        </ul>
      </section>

      {insufficient && (
        <p className={errorBox}>
          Số dư tài khoản chính ({formatVnd(balance)}) không đủ để nạp {formatVnd(deposit)}. Hãy quay lại bước trước để giảm số tiền.
        </p>
      )}

      <BottomActions>
        <button type="button" className={primaryButton} disabled={insufficient} onClick={() => setOpen(true)}>
          Mở tài khoản
        </button>
      </BottomActions>

      <ConfirmSheet
        open={open}
        title="Xác nhận mở tài khoản"
        description={deposit > 0 ? `Chuyển ${formatVnd(deposit)} từ tài khoản chính vào tài khoản mục tiêu.` : "Tài khoản được mở với số dư 0 đồng."}
        rows={[
          { label: "Tài khoản", value: accountName },
          { label: "Từ tài khoản chính", value: deposit, hint: `Còn lại ${formatVnd(balance - deposit)}` },
          { label: "Nạp ban đầu", value: deposit, emphasis: true },
        ]}
        confirmLabel="Xác nhận mở"
        onConfirm={confirm}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
