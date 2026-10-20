"use client";

import { useState } from "react";
import type { ScreenProps } from "../../../model/screens";
import { BottomActions, ScreenHeader } from "../../shared";
import { SummaryRows } from "../../shared/SummaryRows";
import { primaryButton, screenPadding } from "../../shared/styles";
import { LoanSettleSheet } from "../detail/LoanSettleSheet";
import { NotFoundScreen, useLoanScreen } from "../loan/shared";

/** Xem lại hồ sơ vay đã gửi: đang chờ phê duyệt hoặc đã phê duyệt. */
export function LoanAppView({ params }: ScreenProps) {
  const { goal, nav, loanApplications } = useLoanScreen(params);
  const [settling, setSettling] = useState(false);
  const record = goal ? loanApplications.find((item) => item.goalId === goal.id) : undefined;
  if (!goal || !record) return <NotFoundScreen title="Hồ sơ vay" onCta={() => (goal ? nav.pop() : nav.push("GoalList"))} />;
  const approved = record.status === "approved";
  const sent = new Date(record.submittedAt).toLocaleString("vi-VN");
  return (
    <div className={screenPadding}>
      <ScreenHeader title="Hồ sơ vay" subtitle={goal.name} />
      <SummaryRows
        rows={[
          { label: "Trạng thái", value: <span className={approved ? "font-semibold text-positive" : "font-semibold text-warning"}>{approved ? "Đã được phê duyệt" : "Đang chờ phê duyệt"}</span>, emphasis: true },
          { label: "Số tiền vay", value: record.principal },
          { label: "Thời hạn vay", value: `${record.termMonths} tháng` },
          { label: "Thời điểm gửi hồ sơ", value: sent },
          ...(approved && record.approvedAt ? [{ label: "Thời điểm phê duyệt", value: new Date(record.approvedAt).toLocaleString("vi-VN") }] : []),
        ]}
      />
      <p className="text-sm leading-6 text-muted">Lãi suất và khoản trả hằng tháng do MSB quyết định khi giải ngân khoản vay.</p>
      <div className="flex-1" />
      {approved && <LoanSettleSheet goalId={goal.id} open={settling} onClose={() => setSettling(false)} onDone={() => nav.popTo("GoalDetail")} />}
      {approved && (
        <BottomActions>
          <button type="button" className={primaryButton} onClick={() => setSettling(true)}>Chuyển sang giai đoạn trả nợ vay</button>
        </BottomActions>
      )}
    </div>
  );
}
