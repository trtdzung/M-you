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
import { LedgerHistory } from "../detail/LedgerHistory";
import { primaryButton, secondaryButton } from "../styles";
import { EditGoalFlow } from "./EditGoalFlow";
import { LedgerFlow } from "./LedgerFlow";

export function GoalDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const { data, loading, error, status, refresh } = useGoalDetail(id);
  const { update, remove, pending, errors } = useGoalMutations();
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
          <button type="button" className={primaryButton} onClick={() => router.replace("/goals")}>
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
    if (res?.ok) router.replace("/goals");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <GoalDetailHeader goal={goal} />
        <GoalDetailStats goal={goal} />
      </Card>
      <GoalActionBar
        status={goal.status}
        onContribute={() => setLedgerKind("deposit")}
        onWithdraw={() => setLedgerKind("withdraw")}
        onEdit={() => setEditing(true)}
        onTogglePause={() => setStatus(goal.status === "paused" ? "active" : "paused")}
        onArchive={() => setStatus("archived")}
        onDelete={() => setConfirmingDelete(true)}
      />
      <Card>
        <LedgerHistory entries={ledger} />
      </Card>
      {ledgerKind && (
        <LedgerFlow
          goal={goal}
          kind={ledgerKind}
          onClose={() => setLedgerKind(null)}
          onDone={refresh}
        />
      )}
      {editing && (
        <EditGoalFlow goal={goal} onClose={() => setEditing(false)} onSaved={refresh} />
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
