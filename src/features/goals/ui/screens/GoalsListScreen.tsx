"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorState, SkeletonCard } from "@/components/states";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { GOALS_COPY } from "../copy";
import { CreateGoalButton } from "../list/CreateGoalButton";
import { GoalList } from "../list/GoalList";
import { GoalListEmpty } from "../list/GoalListEmpty";
import { secondaryButton } from "../styles";
import { CreateGoalFlow } from "./CreateGoalFlow";

export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  const { seedDemo } = useGoalMutations();
  const [creating, setCreating] = useState(false);
  const onCreate = () => setCreating(true);
  const onSeedDemo = async () => {
    const res = await seedDemo();
    if (res?.ok) refresh();
  };

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
  } else if (!data || data.length === 0) body = <GoalListEmpty onCreate={onCreate} onSeedDemo={onSeedDemo} />;
  else {
    body = (
      <div className="flex flex-col gap-4">
        <GoalList goals={data} onOpen={(id) => router.push("/goals/" + id)} />
        <CreateGoalButton onClick={onCreate} />
      </div>
    );
  }

  return (
    <>
      {body}
      {creating && <CreateGoalFlow onClose={() => setCreating(false)} onCreated={refresh} />}
    </>
  );
}
