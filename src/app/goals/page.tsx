"use client";

import { Empty } from "@/components/states";
import { GOALS_COPY } from "@/features/goals/ui/copy";
import { GoalsHeader } from "@/features/goals/ui/GoalsHeader";

export default function GoalsPage() {
  return (
    <>
      <GoalsHeader />
      <Empty
        title={GOALS_COPY.emptyTitle}
        description={GOALS_COPY.emptyDescription}
      />
    </>
  );
}
