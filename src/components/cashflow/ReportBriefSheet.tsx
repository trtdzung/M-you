"use client";

import { AdvisoryReport } from "@/components/insights/AdvisoryReport";
import { Sheet } from "@/components/primitives";

/**
 * Báo cáo tháng — a bottom-sheet wrapper around the deterministic
 * `AdvisoryReport` (the templated monthly brief). Opened from the "Xem báo cáo
 * tháng" CTA at the bottom of the Dòng tiền chart view, replacing the retired
 * Báo cáo dock. No advisory logic lives here — it is composed in
 * `src/insights/brief.ts`; nothing here moves money (invariant #3).
 */
export function ReportBriefSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      title="Báo cáo tháng"
      description="Kết luận ngắn, bằng chứng và gợi ý từ dữ liệu kỳ này"
      onClose={onClose}
    >
      <AdvisoryReport />
    </Sheet>
  );
}
