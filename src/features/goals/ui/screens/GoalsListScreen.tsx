"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { ErrorState, SkeletonCard } from "@/components/states";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { GOALS_COPY } from "../copy";
import { GoalsHeader } from "../GoalsHeader";
import { GoalList } from "../list/GoalList";
import { secondaryButton } from "../styles";
import { CreateGoalFlow } from "./CreateGoalFlow";
import { GoalCoachPanel } from "./GoalCoachPanel";

export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  const [activeTab, setActiveTab] = useState<"manual" | "chat">("manual");
  const [formKey, setFormKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const hasGoals = !!data?.length;
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  useEffect(() => { setFrame(document.getElementById("device-canvas") ?? document.body); }, []);
  const created = () => {
    refresh();
    setFormKey((key) => key + 1);
    setCreating(false);
    setActiveTab("manual");
    document.getElementById("main-content")?.scrollTo({ top: 0 });
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

  const resetScroll = () => document.getElementById("main-content")?.scrollTo({ top: 0 });
  const openCreate = () => { setCreating(true); resetScroll(); };
  const closeCreate = () => { setCreating(false); resetScroll(); };
  if (loading || error !== null) return <div className="flex flex-col gap-5"><GoalsHeader />{body}</div>;
  if (hasGoals && !creating) return (
    <section className="flex flex-col gap-4 pb-24">
      <GoalsHeader />
      <div>
        <p className="text-[15px] leading-6 text-muted">Từng bước đến những điều bạn muốn.</p>
        <p className="mt-4 text-[13px] font-medium text-muted">{data?.filter(goal => goal.status === "active").length} mục tiêu đang tích lũy</p>
      </div>
      {body}
      {frame && createPortal(
        <button type="button" aria-label="Tạo mục tiêu mới" onClick={openCreate} className="absolute bottom-[calc(24px+var(--safe-area-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2">
          <Plus size={26} strokeWidth={2} aria-hidden="true" />
        </button>, frame,
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-5 pb-[calc(24px+var(--safe-area-bottom))]">
      <GoalsHeader title="Tạo mục tiêu" onBack={hasGoals ? closeCreate : undefined} />
      <div role="tablist" aria-label="Cách tạo mục tiêu" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1">
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
