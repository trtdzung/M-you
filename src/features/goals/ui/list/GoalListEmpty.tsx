import { Inbox } from "lucide-react";
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
    <section className="shadow-card flex flex-col items-center gap-4 rounded-card bg-surface-tint px-5 py-8 text-center">
      <Inbox size={36} strokeWidth={1.5} className="text-muted" aria-hidden="true" />
      <div>
        <h2 className="text-[18px] leading-6 font-semibold text-text">{GOALS_COPY.emptyTitle}</h2>
        <p className="mt-2 text-[16px] leading-6 text-muted">{GOALS_COPY.emptyDescription}</p>
      </div>
        <div className="flex w-full flex-col gap-2">
          <CreateGoalButton onClick={onCreate} />
          {onSeedDemo && (
            <button type="button" onClick={onSeedDemo} className={`${secondaryButton} text-[15px] leading-5 font-medium`}>
              {GOALS_COPY.seedDemo}
            </button>
          )}
        </div>
    </section>
  );
}
