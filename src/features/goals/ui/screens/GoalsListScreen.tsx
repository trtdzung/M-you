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
import { GoalCoachPanel } from "./GoalCoachPanel";

export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  const { seedDemo } = useGoalMutations();
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"manual" | "chat">("manual");
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
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Cách tạo mục tiêu" className="grid grid-cols-2 gap-1 rounded-2xl bg-border/40 p-1">
        {([
          ["manual", "Tạo thủ công"],
          ["chat", "Chat với M-You"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`goals-tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`goals-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next = event.key === "Home" ? "manual" : event.key === "End" ? "chat" : tab === "manual" ? "chat" : "manual";
                setActiveTab(next);
                document.getElementById(`goals-tab-${next}`)?.focus();
              }
            }}
            className={`min-h-11 rounded-xl px-2 py-3 text-[14px] leading-5 font-medium transition-colors ${activeTab === tab ? "bg-surface text-text shadow-sm" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="goals-panel-manual" aria-labelledby="goals-tab-manual" hidden={activeTab !== "manual"}>
        {body}
      </div>
      <div role="tabpanel" id="goals-panel-chat" aria-labelledby="goals-tab-chat" hidden={activeTab !== "chat"}>
        <GoalCoachPanel onCreated={refresh} />
      </div>
      {creating && <CreateGoalFlow onClose={() => setCreating(false)} onCreated={refresh} />}
    </div>
  );
}
