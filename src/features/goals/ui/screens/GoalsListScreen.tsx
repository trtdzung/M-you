"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { ErrorState, SkeletonCard } from "@/components/states";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { GOALS_COPY } from "../copy";
import { GoalList } from "../list/GoalList";
import { primaryButton, secondaryButton } from "../styles";
import { CreateGoalFlow } from "./CreateGoalFlow";
import { GoalCoachPanel } from "./GoalCoachPanel";

export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  const [activeTab, setActiveTab] = useState<"manual" | "chat">("manual");
  const [formKey, setFormKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const hasGoals = !!data?.length;
  const created = () => {
    refresh();
    setFormKey((key) => key + 1);
    setCreating(false);
    setActiveTab("manual");
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

  if (loading || error !== null) return <>{body}</>;
  if (hasGoals && !creating) return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-semibold text-text">Mục tiêu của bạn</h2>
          <button type="button" aria-label="Tạo mục tiêu mới" className={`${primaryButton} h-11 shrink-0 gap-1.5 px-3 text-[14px]`} onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" />Tạo mới
          </button>
        </div>
        <p className="mt-1 text-[14px] leading-5 text-muted">Theo dõi tiến độ tích lũy cho những điều bạn muốn.</p>
      </div>
      {body}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {hasGoals && <button type="button" className="min-h-11 self-start text-[14px] font-medium text-primary" onClick={() => setCreating(false)}>← Về danh sách mục tiêu</button>}
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
        <GoalCoachPanel onCreated={created} />
      </div>
    </div>
  );
}
