import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";

/**
 * Shown when there is not enough data to compute a reliable result.
 * Distinct from Empty: data exists but coverage is too low to trust.
 */
export function InsufficientData({
  title = "Chưa đủ dữ liệu",
  description = "Cần thêm dữ liệu để đưa ra kết quả đáng tin cậy.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="shadow-card flex flex-col items-center justify-center gap-3 rounded-[24px] bg-warning-soft/60 px-6 py-10 text-center">
      <HelpCircle size={38} strokeWidth={1.5} className="text-warning" />
      <div>
        <p className="text-base font-semibold text-text">{title}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
