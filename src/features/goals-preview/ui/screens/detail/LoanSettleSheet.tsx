"use client";

import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/features/goals-preview/format-money";
import { usePreview } from "../../../store/PreviewStore";
import { SummaryRows } from "../../shared/SummaryRows";
import { primaryButton, secondaryButton } from "../../shared/styles";
import { useGoalContext } from "./common";

/**
 * Bước cuối trước giai đoạn trả vay, cho hồ sơ vay đã được phê duyệt: giải thích khách đang tất toán cái gì cho ngân hàng
 * (tiền và tài sản đã tích luỹ dùng thanh toán một phần giá trị mục tiêu, phần còn lại do khoản vay chi trả).
 * Chỉ khi khách bấm "Tất toán cho ngân hàng" khoản vay mới được giải ngân và mục tiêu sang giai đoạn trả vay.
 */
export function LoanSettleSheet({ goalId, open, onClose, onDone }: { goalId: string; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { loanApplications, startRepayment } = usePreview();
  const ctx = useGoalContext(goalId);
  const record = loanApplications.find((item) => item.goalId === goalId);
  if (!ctx || !record) return null;
  const { goal, value } = ctx;
  const settle = () => {
    startRepayment(goalId);
    onClose();
    onDone?.();
  };
  return (
    <Sheet open={open} title="Tất toán để mua tài sản" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[14px] leading-6 text-text">
          Hồ sơ vay của bạn đã được phê duyệt. Để mua tài sản cho mục tiêu <b>{goal.name}</b>, bạn cần tất toán phần đã tích luỹ cho ngân hàng. Phần còn lại của giá trị mục tiêu do khoản vay chi trả.
        </p>
        <SummaryRows
          rows={[
            { label: "Giá trị mục tiêu", value: goal.targetAmount },
            { label: "Số tiền của bạn còn trong tài khoản mục tiêu", value: value.cash, emphasis: true },
            ...(value.assets > 0 ? [{ label: "Tài sản đã tích luỹ cho mục tiêu", value: value.assets }] : []),
            { label: "Khoản vay được giải ngân", value: record.principal },
          ]}
        />
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] leading-6 text-text">
          <li>Số tiền còn trong tài khoản mục tiêu ({formatVnd(value.cash)}) được dùng để thanh toán một phần giá trị mục tiêu.</li>
          {value.assets > 0 && (
            <li>
              Các tài sản bạn đã tích luỹ cho mục tiêu ({formatVnd(value.assets)}) cũng được dùng để thanh toán một phần giá trị mục tiêu. Sau khi tất toán, các tài sản này không còn được tính vào mục tiêu và không được quy đổi thành tiền trong tài khoản.
            </li>
          )}
          <li>Khoản vay {formatVnd(record.principal)} do ngân hàng giải ngân cho phần còn lại, không đi qua tài khoản mục tiêu. Bạn trả dần theo lịch trả vay ({record.termMonths} tháng).</li>
          <li>Sau khi tất toán, mục tiêu chuyển sang giai đoạn 2 (trả vay). Tiến độ lúc này tính theo số gốc đã trả; tài sản vừa mua không được tính vào tiến độ trả vay.</li>
        </ol>
        <p className="text-[13px] leading-5 text-muted">Thao tác này không thể hoàn tác.</p>
        <div className="flex flex-col gap-2">
          <button type="button" className={primaryButton} onClick={settle}>Tất toán cho ngân hàng</button>
          <button type="button" className={secondaryButton} onClick={onClose}>Để sau</button>
        </div>
      </div>
    </Sheet>
  );
}
