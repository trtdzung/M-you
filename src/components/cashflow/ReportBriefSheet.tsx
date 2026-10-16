"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AdvisoryReport } from "@/components/insights/AdvisoryReport";
import { Sheet } from "@/components/primitives";

/**
 * Báo cáo tháng — a bottom-sheet wrapper around the deterministic
 * `AdvisoryReport` (the templated monthly brief) plus the "mở báo cáo cùng trợ
 * lý" hand-off. Opened from the "Xem báo cáo tháng" CTA at the bottom of the
 * Dòng tiền chart view, replacing the retired Báo cáo dock. No advisory logic
 * lives here — it is composed in `src/insights/brief.ts`; the CTA never moves
 * money (invariant #3).
 */
export function ReportBriefSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      title="Báo cáo tháng"
      description="Kết luận ngắn, bằng chứng và gợi ý từ dữ liệu kỳ này"
      onClose={onClose}
    >
        <AdvisoryReport />

        <Link
          href="/assistant"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Sparkles size={16} /> Mở báo cáo cùng trợ lý
        </Link>
    </Sheet>
  );
}
