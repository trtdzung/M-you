import { Empty } from "@/components/states";
import { GOALS_COPY } from "../copy";
import { CreateGoalButton } from "./CreateGoalButton";

export function GoalListEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <Empty
      title={GOALS_COPY.emptyTitle}
      description={GOALS_COPY.emptyDescription}
      action={<CreateGoalButton onClick={onCreate} />}
    />
  );
}
