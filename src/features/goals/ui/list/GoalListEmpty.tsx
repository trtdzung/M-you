import { Empty } from "@/components/states";
import { GOALS_COPY } from "../copy";
import { secondaryButton } from "../styles";
import { CreateGoalButton } from "./CreateGoalButton";

export function GoalListEmpty({
  onCreate,
  onSeedDemo,
}: {
  onCreate: () => void;
  onSeedDemo?: () => void;
}) {
  return (
    <Empty
      title={GOALS_COPY.emptyTitle}
      description={GOALS_COPY.emptyDescription}
      action={
        <div className="flex flex-col gap-2">
          <CreateGoalButton onClick={onCreate} />
          {onSeedDemo && (
            <button type="button" onClick={onSeedDemo} className={secondaryButton}>
              {GOALS_COPY.seedDemo}
            </button>
          )}
        </div>
      }
    />
  );
}
