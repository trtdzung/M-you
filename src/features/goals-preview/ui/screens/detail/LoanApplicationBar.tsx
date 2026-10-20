"use client";

import { useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { usePreview } from "../../../store/PreviewStore";
import { LoanSettleSheet } from "./LoanSettleSheet";
import { card, primaryButton, secondaryButton } from "../../shared/styles";

/**
 * Ô ngay dưới thẻ tiến độ trong chi tiết mục tiêu cho hồ sơ vay đã gửi: đang chờ phê duyệt, rồi đã phê duyệt
 * (khách bấm chuyển, đọc giải thích trong bottom sheet, rồi bấm "Tất toán cho ngân hàng" để sang giai đoạn trả vay). Biến mất khi khoản vay đã được tạo.
 */
export function LoanApplicationBar({ goalId }: { goalId: string }) {
  const { loanApplications, nav } = usePreview();
  const [settling, setSettling] = useState(false);
  const record = loanApplications.find((item) => item.goalId === goalId);
  if (!record) return null;
  const approved = record.status === "approved";
  const view = () => nav.push("LoanAppView", { goalId });
  return (
    <section role="status" aria-label="Hồ sơ vay" className={`${card} flex flex-col gap-3`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-text">
        {approved ? <CheckCircle2 size={20} className="shrink-0 text-positive" aria-hidden /> : <Clock size={20} className="shrink-0 animate-pulse text-warning" aria-hidden />}
        {approved ? "Hồ sơ của bạn đã được phê duyệt" : "Hồ sơ của bạn đang chờ phê duyệt"}
      </p>
      <div className="flex flex-col gap-2">
        {approved && <button type="button" className={primaryButton} onClick={() => setSettling(true)}>Chuyển sang giai đoạn trả nợ vay</button>}
        <button type="button" className={secondaryButton} onClick={view}>Xem hồ sơ</button>
      </div>
    {approved && <LoanSettleSheet goalId={goalId} open={settling} onClose={() => setSettling(false)} />}
    </section>
  );
}
