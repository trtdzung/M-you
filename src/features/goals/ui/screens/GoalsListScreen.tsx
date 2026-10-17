"use client";

import { useRouter } from "next/navigation";
import { ErrorState, SkeletonCard } from "@/components/states";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { GOALS_COPY } from "../copy";
import { CreateGoalButton } from "../list/CreateGoalButton";
import { GoalList } from "../list/GoalList";
import { GoalListEmpty } from "../list/GoalListEmpty";
import { secondaryButton } from "../styles";

export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  // Opening the create sheet is wired in T19.
  const onCreate = () => {};

  if (loading) return <SkeletonCard />;
  if (error !== null) {
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
  if (!data || data.length === 0) return <GoalListEmpty onCreate={onCreate} />;
  return (
    <div className="flex flex-col gap-4">
      <GoalList goals={data} onOpen={(id) => router.push("/goals/" + id)} />
      <CreateGoalButton onClick={onCreate} />
    </div>
  );
}
