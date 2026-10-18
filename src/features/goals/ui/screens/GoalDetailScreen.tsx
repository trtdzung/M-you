"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard } from "@/components/states";
import { useGoalDetail } from "../../client/hooks/use-goal-detail";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import type { GoalLedgerKind, GoalStatus } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { DeleteGoalConfirm } from "../detail/DeleteGoalConfirm";
import { GoalActionBar } from "../detail/GoalActionBar";
import { GoalDetailHeader } from "../detail/GoalDetailHeader";
import { GoalDetailStats } from "../detail/GoalDetailStats";
import { SavedGoalAssessment } from "../advisor/SavedGoalAssessment";
import { GoalTimeline } from "../detail/GoalTimeline";
import { LedgerHistory } from "../detail/LedgerHistory";
import { primaryButton, secondaryButton } from "../styles";
import { EditGoalFlow } from "./EditGoalFlow";
import { LedgerFlow } from "./LedgerFlow";
import { GOALS_TAB_HREF } from "../routes";

export function GoalDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { data, loading, error, status, refresh } = useGoalDetail(id);
  const { update, remove, pending, errors } = useGoalMutations();
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [ledgerKind, setLedgerKind] = useState<GoalLedgerKind | null>(null);

  if (loading) return <SkeletonCard />;
  if (status === 404) {
    return (
      <Empty
        title={GOALS_COPY.notFoundTitle}
        description={GOALS_COPY.notFoundDescription}
        action={
          <button type="button" className={primaryButton} onClick={() => router.replace(GOALS_TAB_HREF)}>
            {GOALS_COPY.backToList}
          </button>
        }
      />
    );
  }
  if (error !== null || !data) {
    return (
      <ErrorState
        description={error || GOALS_COPY.loadError}
        action={
          <button type="button" onClick={refresh} className={secondaryButton}>
            {GOALS_COPY.retry}
          </button>
        }
      />
    );
  }

  const { goal, ledger } = data;
  const setStatus = async (next: GoalStatus) => {
    const res = await update(goal.id, { status: next });
    if (res?.ok) refresh();
  };
  const confirmDelete = async () => {
    const res = await remove(goal.id);
    if (res?.ok) router.replace(GOALS_TAB_HREF);
  };

  return (
    <div className="flex flex-col gap-5 pb-6 pt-4">
      {feedback && <p role="status" className="rounded-xl bg-primary/10 p-3 text-[14px] text-text">{feedback}</p>}
      {(goal.status !== "active" || goal.currentAmount >= goal.targetAmount) && <p className="rounded-2xl border border-border bg-surface p-4 text-[14px] leading-6 text-muted">{goal.status === "archived" ? "Mục tiêu đã lưu trữ. Lịch sử tích lũy vẫn được giữ để bạn xem lại." : goal.status === "paused" ? "Bạn đang tạm dừng mục tiêu này. Chọn Tiếp tục trong Quản lý mục tiêu khi sẵn sàng." : "Bạn đã đạt mục tiêu! Có thể lưu trữ để giữ lịch sử và bắt đầu kế hoạch tiếp theo."}</p>}
      <Card className="flex flex-col gap-4 rounded-2xl">
        <GoalDetailHeader goal={goal} />
      </Card>
      <GoalActionBar
        section="actions"
        withdrawDisabled={goal.currentAmount === 0}
        status={goal.status}
        onContribute={() => setLedgerKind("deposit")}
        onWithdraw={() => setLedgerKind("withdraw")}
        onEdit={() => setEditing(true)}
        onTogglePause={() => setStatus(goal.status === "paused" ? "active" : "paused")}
        onArchive={() => setStatus("archived")}
        onDelete={() => setConfirmingDelete(true)}
      />
      <Card className="rounded-2xl"><GoalDetailStats goal={goal} /></Card>
      <SavedGoalAssessment goal={goal} onUpdated={() => { refresh(); setFeedback("Đã điều chỉnh mục tiêu. Đánh giá sẽ được cập nhật theo kế hoạch mới."); }} />
      <GoalTimeline goal={goal} ledger={ledger} />
      <Card className="rounded-2xl">
        <LedgerHistory entries={ledger} />
      </Card>
      <GoalActionBar
        section="management"
        withdrawDisabled={goal.currentAmount === 0}
        status={goal.status}
        onContribute={() => setLedgerKind("deposit")}
        onWithdraw={() => setLedgerKind("withdraw")}
        onEdit={() => setEditing(true)}
        onTogglePause={() => setStatus(goal.status === "paused" ? "active" : "paused")}
        onArchive={() => setStatus("archived")}
        onDelete={() => setConfirmingDelete(true)}
      />
      {ledgerKind && (
        <LedgerFlow
          goal={goal}
          kind={ledgerKind}
          onClose={() => setLedgerKind(null)}
          onDone={() => { refresh(); setFeedback(ledgerKind === "deposit" ? "Đã ghi nhận khoản góp. Tiến độ đã được cập nhật." : "Đã ghi nhận khoản rút. Tiến độ đã được cập nhật."); }}
        />
      )}
      {editing && (
        <EditGoalFlow goal={goal} onClose={() => setEditing(false)} onSaved={() => { refresh(); setFeedback("Đã lưu thay đổi mục tiêu."); }} />
      )}
      {confirmingDelete && (
        <DeleteGoalConfirm
          pending={pending}
          error={errors ? (errors._form ?? "") : null}
          onConfirm={confirmDelete}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
