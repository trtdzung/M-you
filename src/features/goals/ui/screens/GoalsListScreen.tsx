"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorState, SkeletonCard } from "@/components/states";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { GOALS_COPY } from "../copy";
import { GoalList } from "../list/GoalList";
import { secondaryButton } from "../styles";
import { CreateGoalFlow } from "./CreateGoalFlow";
import { GoalCoachPanel } from "./GoalCoachPanel";

export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  const [activeTab, setActiveTab] = useState<"manual" | "chat">("manual");
  const [formKey, setFormKey] = useState(0);
  const created = () => {
    refresh();
    setFormKey((key) => key + 1);
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
  } else if (!data || data.length === 0) body = null;
  else {
    body = (
      <div className="flex flex-col gap-4">
        <GoalList goals={data} onOpen={(id) => router.push("/goals/" + id)} />

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
        <CreateGoalFlow key={formKey} inline onClose={() => {}} onCreated={created} />
      </div>
      <div role="tabpanel" id="goals-panel-chat" aria-labelledby="goals-tab-chat" hidden={activeTab !== "chat"}>
        <GoalCoachPanel onCreated={refresh} />
      </div>
      {body && <section className="flex flex-col gap-3"><h2 className="text-[18px] font-semibold text-text">Mục tiêu của bạn</h2>{body}</section>}
    </div>
  );
}
