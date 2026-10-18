"use client";

import { useState } from "react";
import { Info, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, SectionHeader } from "@/components/primitives";
import { ErrorState, SkeletonCard } from "@/components/states";
import { summarizeGoals } from "../../engine/summary";
import { formatGoalMoney } from "../shared/format-goal-money";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { GOALS_COPY } from "../copy";
import { GoalList } from "../list/GoalList";
import { secondaryButton } from "../styles";

/** Body of the "Mục tiêu" tab in /pfm: lives inside the team's header + bottom nav, so no own header or FAB. */
export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  const [showSummaryInfo, setShowSummaryInfo] = useState(false);
  const summary = summarizeGoals(data ?? []);
  const hasGoals = !!data?.length;

  let body;
  if (loading) body = <SkeletonCard />;
  else if (error !== null) {
    body = (
      <ErrorState
        description={error || GOALS_COPY.loadError}
        action={
          <button type="button" onClick={refresh} className={secondaryButton}>
            {GOALS_COPY.retry}
          </button>
        }
      />
    );
  } else if (!data || data.length === 0) body = null;
  else {
    body = (
      <div className="flex flex-col gap-4">
        <GoalList goals={data} onOpen={(id) => router.push("/goals/" + id)} />

      </div>
    );
  }

  const openCreate = () => router.push("/goals/new");
  if (loading || error !== null) return <div className="flex flex-col gap-5">{body}</div>;
  if (!hasGoals) return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text">Chưa có mục tiêu nào</h2>
      <p className="text-sm leading-6 text-muted">Tạo mục tiêu tích lũy. M-You sẽ đánh giá kế hoạch và hướng dẫn bạn cách đạt mục tiêu.</p>
      <button type="button" onClick={openCreate} className={secondaryButton}>Thêm mục tiêu</button>
    </Card>
  );
  return (
    <section className="flex flex-col gap-4">
      {summary.active === 0 && <p className="rounded-2xl border border-border bg-surface p-4 text-[14px] leading-6 text-muted">Chưa có mục tiêu đang tích lũy. Bạn có thể tiếp tục một mục tiêu đã tạm dừng hoặc bấm + để tạo kế hoạch mới.</p>}
      <Card padding="snug">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] text-muted">Tổng đã tích lũy</p>
          <button
            type="button"
            aria-label="Thông tin tổng tích lũy"
            aria-expanded={showSummaryInfo}
            aria-controls="goals-summary-info"
            onClick={() => setShowSummaryInfo((shown) => !shown)}
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Info size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="text-[28px] font-semibold leading-9 tabular-nums text-text">{formatGoalMoney(summary.saved)} <span className="text-[13px] font-normal text-muted">VND</span></p>
        <p className="mt-2 text-[13px] leading-5 text-muted">{summary.active} mục tiêu đang tích lũy</p>
        <p id="goals-summary-info" hidden={!showSummaryInfo} className="mt-3 border-t border-border/60 pt-3 text-[12px] leading-5 text-muted">Tổng từ {summary.count} mục tiêu chưa lưu trữ, theo các khoản tích lũy bạn tự ghi nhận; chưa được ngân hàng xác nhận.</p>
      </Card>
      <SectionHeader
        title="Mục tiêu của bạn"
        className="mb-0 pt-1"
        action={
          <button
            type="button"
            aria-label="Thêm mục tiêu"
            onClick={openCreate}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Plus size={14} aria-hidden /> Thêm mục tiêu
          </button>
        }
      />
      {body}
    </section>
  );

}
