"use client";

import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { loanProductFor } from "../../../data/products";
import { annuityPayment, loanPurposeFor } from "../../../engine";
import { usePreview } from "../../../store/PreviewStore";
import { SummaryRows, type SummaryRow } from "../../shared/SummaryRows";
import { primaryButton, secondaryButton } from "../../shared/styles";
import { useGoalContext } from "./common";

function Group({ title, rows }: { title: string; rows: SummaryRow[] }): ReactNode {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-muted">{title}</h3>
      <SummaryRows rows={rows} />
    </section>
  );
}

/**
 * Xác nhận mua tài sản, bước cuối trước giai đoạn trả vay (hồ sơ vay đã được phê duyệt): nguồn thanh toán (tài sản tích luỹ +
 * số dư tài khoản mục tiêu + khoản vay = giá trị mục tiêu) và điều khoản khoản vay. Chỉ khi khách bấm "Xác nhận mua tài sản"
 * khoản vay mới được giải ngân và mục tiêu sang giai đoạn trả vay.
 */
export function LoanSettleSheet({ goalId, open, onClose, onDone }: { goalId: string; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { loanApplications, startRepayment } = usePreview();
  const ctx = useGoalContext(goalId);
  const record = loanApplications.find((item) => item.goalId === goalId);
  if (!ctx || !record) return null;
  const { goal, value } = ctx;
  const product = loanProductFor(loanPurposeFor(goal.template));
  const termMonths = Math.min(product.maxTermMonths, record.termMonths);
  const monthly = annuityPayment(record.principal, product.ratePa, termMonths);
  const confirm = () => {
    startRepayment(goalId);
    onClose();
    onDone?.();
  };
  return (
    <Sheet open={open} title={`Xác nhận mua ${goal.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-6 text-text">
          Hồ sơ vay của bạn đã được phê duyệt. Để mua {goal.name}, ngân hàng sẽ quy đổi tài sản bạn đã tích luỹ và giải ngân khoản vay cho phần còn lại.
        </p>
        <Group
          title="Nguồn thanh toán"
          rows={[
            ...(value.assets > 0 ? [{ label: "Tài sản tích luỹ", value: value.assets, hint: "Quy đổi theo giá trị hiện tại" }] : []),
            { label: "Số dư tài khoản mục tiêu", value: value.cash },
            { label: "Khoản vay", value: record.principal },
            { label: "Giá trị mục tiêu", value: goal.targetAmount, emphasis: true },
          ]}
        />
        <Group
          title="Khoản vay của bạn"
          rows={[
            { label: "Kỳ hạn", value: `${termMonths} tháng` },
            { label: "Trả hằng tháng", value: monthly },
            { label: "Lãi suất", value: `${product.ratePa}%/năm` },
            { label: "Tổng phải trả", value: monthly * termMonths },
          ]}
        />
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-text">
          <li>Khoản vay được giải ngân trực tiếp, không đi qua tài khoản mục tiêu.</li>
          <li>Sau khi hoàn tất, mục tiêu chuyển sang giai đoạn trả vay. Tiến độ tính theo số gốc đã trả, không gồm giá trị tài sản vừa mua.</li>
        </ul>
        <p role="alert" className="flex items-center gap-2 rounded-2xl bg-negative-soft px-3.5 py-3 text-xs font-medium text-negative">
          <CircleAlert size={18} className="shrink-0" aria-hidden /> Sau khi xác nhận, bạn không thể hoàn tác.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" className={primaryButton} onClick={confirm}>Xác nhận mua tài sản</button>
          <button type="button" className={secondaryButton} onClick={onClose}>Để sau</button>
        </div>
      </div>
    </Sheet>
  );
}
