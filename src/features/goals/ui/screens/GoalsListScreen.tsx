"use client";

import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { SectionHeader } from "@/components/primitives";
import { ErrorState, SkeletonCard } from "@/components/states";
import { summarizeGoals } from "../../engine/summary";
import { formatGoalMoney } from "../shared/format-goal-money";
import { useGoalsList } from "../../client/hooks/use-goals-list";
import { GOALS_COPY } from "../copy";
import { GoalList } from "../list/GoalList";
import { secondaryButton } from "../styles";
import { CreateGoalFlow } from "./CreateGoalFlow";
import { GoalCoachPanel } from "./GoalCoachPanel";

// The "Mục tiêu" tab of /pfm scrolls inside its tab panel, not in the shell's main.
const scrollToTop = () =>
  (document.getElementById("pfm-panel-goals") ?? document.getElementById("main-content"))?.scrollTo({ top: 0 });

/** Body of the "Mục tiêu" tab in /pfm: lives inside the team's header + bottom nav, so no own header or FAB. */
export function GoalsListScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useGoalsList();
  const [activeTab, setActiveTab] = useState<"manual" | "chat">("manual");
  const [formKey, setFormKey] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const summary = summarizeGoals(data ?? []);
  const hasGoals = !!data?.length;
  const created = () => {
    setFeedback("Đã tạo mục tiêu. Bắt đầu ghi nhận khoản tích lũy đầu tiên nhé.");
    refresh();
    setFormKey((key) => key + 1);
    setCreating(false);
    setActiveTab("manual");
    scrollToTop();
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

  const openCreate = () => { setCreating(true); scrollToTop(); };
  const closeCreate = () => { setCreating(false); scrollToTop(); };
  if (loading || error !== null) return <div className="flex flex-col gap-5">{body}</div>;
  if (hasGoals && !creating) return (
    <section className="flex flex-col gap-4">
      {feedback && <p role="status" className="rounded-xl bg-primary/10 p-3 text-[14px] text-text">{feedback}</p>}
      {summary.active === 0 && <p className="rounded-2xl border border-border bg-surface p-4 text-[14px] leading-6 text-muted">Chưa có mục tiêu đang tích lũy. Bạn có thể tiếp tục một mục tiêu đã tạm dừng hoặc bấm + để tạo kế hoạch mới.</p>}
      <div className="rounded-2xl bg-surface-tint px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[14px] text-muted">Tổng đã tích lũy</p><p className="text-[24px] font-semibold leading-8 tabular-nums text-text">{formatGoalMoney(summary.saved)} <span className="text-[12px] font-normal text-muted">VND</span></p></div>
        <p className="mt-2 text-[12px] leading-5 text-muted">Bạn tự ghi nhận · {summary.count} mục tiêu · Không gồm lưu trữ</p>
      </div>
      <SectionHeader
        title="Mục tiêu của bạn"
        subtitle={`${summary.active} đang tích lũy`}
        className="mb-0 pt-1"
        action={
          <button
            type="button"
            aria-label="Tạo mục tiêu mới"
            onClick={openCreate}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Plus size={14} aria-hidden /> Tạo mới
          </button>
        }
      />
      {body}
    </section>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        {hasGoals && (
          <button
            type="button"
            onClick={closeCreate}
            aria-label="Quay lại"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        )}
        <h2 className="text-base font-semibold text-text">Tạo mục tiêu</h2>
      </div>
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
        <GoalCoachPanel active={activeTab === "chat"} onCreated={created} />
      </div>
    </div>
  );
}
