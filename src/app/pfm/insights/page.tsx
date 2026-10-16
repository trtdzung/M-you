"use client";

import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { InsightCard } from "@/components/insights/InsightCard";
import { useInsights } from "@/state/useInsights";

/**
 * Danh sách gợi ý đầy đủ (di dời khỏi Home cũ). Mỗi insight từ `runDetectors`,
 * kèm hành động dismiss/snooze/helpful (cùng `insightState` với card Home).
 */
export default function PfmInsightsPage() {
  const { loading, error, visible, dismiss, snooze, markHelpful } = useInsights();

  return (
    <div>
      <ScreenHeader title="Gợi ý" subtitle="Dựa trên quy tắc, tính từ dữ liệu của bạn" />

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && (
        visible.length > 0 ? (
          <div className="flex flex-col gap-3">
            {visible.map((i) => (
              <InsightCard
                key={i.id}
                insight={i}
                actions={{ dismiss, snooze, markHelpful }}
              />
            ))}
          </div>
        ) : (
          <Empty title="Chưa có gợi ý" description="Chưa phát hiện điểm nào đáng chú ý trong tháng này." />
        )
      )}
    </div>
  );
}
