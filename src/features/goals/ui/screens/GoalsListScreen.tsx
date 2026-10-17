"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { ErrorState, SkeletonCard } from "@/components/states";
import { summarizeGoals } from "../../engine/summary";
import { formatVndCompact } from "@/lib/format";
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
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const summary = summarizeGoals(data ?? []);
  const compactMoney = (amount: number) => formatVndCompact(amount).replace(/\s*₫$/, "");
  const hasGoals = !!data?.length;
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  useEffect(() => { setFrame(document.getElementById("device-canvas") ?? document.body); }, []);
  const created = () => {
    setFeedback("Đã tạo mục tiêu. Bắt đầu ghi nhận khoản tích lũy đầu tiên nhé.");
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
      {feedback && <p role="status" className="rounded-xl bg-primary/10 p-3 text-[14px] text-text">{feedback}</p>}
      {summary.active === 0 && <p className="rounded-2xl border border-border bg-surface p-4 text-[14px] leading-6 text-muted">Chưa có mục tiêu đang tích lũy. Bạn có thể tiếp tục một mục tiêu đã tạm dừng hoặc bấm + để tạo kế hoạch mới.</p>}
      <div className="rounded-3xl border border-primary/10 bg-surface-tint p-5">
        <div className="flex items-center gap-2 text-[14px] font-medium text-muted"><Target size={18} className="text-primary" aria-hidden="true" />Tổng đã tích lũy</div>
        <p className="mt-3 flex flex-wrap items-baseline gap-2 tabular-nums"><span className="text-[32px] font-semibold leading-10 tracking-tight text-text">{compactMoney(summary.saved)}</span><span className="text-[14px] text-muted">VND</span></p>
        <p className="mt-1 text-[14px] text-muted">Cho {summary.count} mục tiêu · Tổng đích {compactMoney(summary.target)} VND</p>
        <p className="mt-4 border-t border-primary/10 pt-3 text-[12px] leading-5 text-muted">Số tiền bạn tự ghi nhận · Không gồm mục tiêu đã lưu trữ</p>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1"><h2 className="text-[18px] font-semibold text-text">Mục tiêu của bạn</h2><span className="text-[13px] text-muted">{summary.active} đang tích lũy</span></div>
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
        <GoalCoachPanel active={activeTab === "chat"} onCreated={created} />
      </div>
    </div>
  );
}
