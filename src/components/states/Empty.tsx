import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/** Friendly empty state. Defaults are Vietnamese and generic. */
export function Empty({
  title = "Chưa có dữ liệu",
  description = "Nội dung sẽ xuất hiện tại đây khi có dữ liệu.",
  icon,
  action,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted px-6 py-12 text-center">
      <div className="text-muted">{icon ?? <Inbox size={40} strokeWidth={1.5} />}</div>
      <div>
        <p className="text-base font-semibold text-text">{title}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
