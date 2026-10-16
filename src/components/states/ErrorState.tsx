import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** Error state with optional retry action. */
export function ErrorState({
  title = "Đã có lỗi xảy ra",
  description = "Không thể tải dữ liệu. Vui lòng thử lại.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="shadow-card flex flex-col items-center justify-center gap-3 rounded-card bg-negative-soft/60 px-6 py-12 text-center"
    >
      <AlertTriangle size={40} strokeWidth={1.5} className="text-negative" />
      <div>
        <p className="text-base font-semibold text-text">{title}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
