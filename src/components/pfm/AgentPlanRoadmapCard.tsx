"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { markApplied, proposalKey, wasApplied } from "@/lib/agent-applied";
import { sendGoalAction } from "@/lib/agent-goal-api";
import type { MilestoneKind, PlanOption, PlanRoadmapUi, PlanVerdict } from "@/lib/agent-plan-api";
import { usePersona } from "@/providers/context";

const VERDICT_BADGE: Record<PlanVerdict, { label: string; className: string }> = {
  recommended: { label: "Khuyến nghị", className: "bg-positive-soft text-positive" },
  ok: { label: "Phù hợp", className: "bg-primary-soft text-primary-strong" },
  late: { label: "Trễ hạn", className: "bg-warning-soft text-warning" },
  not_recommended: { label: "Không khuyến nghị", className: "bg-negative-soft text-negative" },
};

/** Dot colour by milestone kind: neutral-blue family / positive / warning family. */
const DOT: Record<MilestoneKind, string> = {
  reserve: "bg-sky-500",
  save: "bg-sky-500",
  switch: "bg-sky-500",
  buy: "bg-positive",
  done: "bg-positive",
  loan: "bg-warning",
  repay: "bg-warning",
};

/** Same look as the "Lộ trình" list of the goal detail: dot and line on the left, title, when, then the one action. */
function Timeline({ plan }: { plan: PlanOption }) {
  return (
    <ol className="mt-1 flex flex-col">
      {plan.milestones.map((m, i, all) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span aria-hidden data-kind={m.kind} className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", DOT[m.kind])} />
            {i < all.length - 1 && <span aria-hidden className="w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 pb-3">
            <p className="break-words text-sm font-semibold text-text">{m.title}</p>
            <p className="text-[12px] text-muted">{m.when}</p>
            {m.action && <p className="break-words text-[12px] font-medium text-primary-strong">{m.action}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PlanSection({
  plan,
  initiallyOpen,
  disabled,
  canChoose,
  buttonLabel,
  error,
  onPick,
}: {
  plan: PlanOption;
  initiallyOpen: boolean;
  /** False for a card without a goal: nothing to attach the roadmap to, so no choose button. */
  canChoose: boolean;
  disabled?: boolean;
  /** Label of the choose button (it says what pressing it does). */
  buttonLabel: string;
  /** Problem to show under the button after a refused choice. */
  error?: string | null;
  onPick: (plan: PlanOption) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const badge = VERDICT_BADGE[plan.verdict];
  const collapsible = plan.verdict !== "not_recommended";
  const header = (
    <>
      <span className="min-w-0 flex-1 break-words text-sm font-semibold text-text">{plan.name}</span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", badge.className)}>{badge.label}</span>
      {collapsible && (
        <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      )}
    </>
  );

  return (
    <section aria-label={plan.name} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-muted p-2.5">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2">{header}</div>
      )}
      <p className="break-words text-sm text-text">{plan.headline}</p>
      {!collapsible && plan.reason && <p className="break-words text-xs text-muted">{plan.reason}</p>}

      {collapsible && open && (
        <>
          <Timeline plan={plan} />
          {canChoose && plan.choice_text && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(plan)}
              className="mt-1 h-9 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {buttonLabel}
            </button>
          )}
          {error && <p role="alert" className="break-words text-xs text-negative">{error}</p>}
        </>
      )}
    </section>
  );
}

/**
 * The `plan_roadmap` card, kept short: the title, then one section per plan with a verdict badge, a one-line headline, the
 * milestone list (title, when, action; like the goal detail "Lộ trình") and a "Chọn phương án này" button. The recommended plan
 * (else the first choosable one) starts expanded; `not_recommended` plans show only name, badge, headline and reason. The
 * baseline, assumptions, metrics, details and bad-scenario lines of the payload are for the agent's answer, not drawn here.
 *
 * A roadmap always belongs to a goal (`ui.goal_id`): the button saves the plan as that goal's roadmap (`setRoadmap`, shown in the
 * goal's "Lộ trình" section) and tells the agent nothing. A card from an older conversation that has no `goal_id` is shown for
 * reading only (no choose button).
 */
export function AgentPlanRoadmapCard({ ui, fullWidth = false }: { ui: PlanRoadmapUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const goalId = ui.goal_id;
  const planKey = (plan: PlanOption) => proposalKey(persona.cif, { type: "setRoadmap", goalId, plan });
  const [appliedId, setAppliedId] = useState<string | null>(() => (goalId ? (ui.plans.find((p) => wasApplied(planKey(p)))?.id ?? null) : null));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ planId: string; text: string } | null>(null);
  const openId = (ui.plans.find((p) => p.verdict === "recommended") ?? ui.plans.find((p) => p.verdict !== "not_recommended"))?.id;

  async function pick(plan: PlanOption) {
    if (!goalId) return;
    // milestones the agent gave no month for cannot be placed on the calendar
    const milestones = plan.milestones.flatMap((m) =>
      m.month === undefined
        ? []
        : [{
            month: m.month,
            ...(m.end_month === undefined ? {} : { endMonth: m.end_month }),
            kind: m.kind,
            title: m.title,
            ...(m.detail ? { detail: m.detail } : {}),
            ...(m.action ? { action: m.action } : {}),
          }],
    );
    if (milestones.length === 0) {
      setProblem({ planId: plan.id, text: "Phương án này chưa có mốc thời gian nên chưa đặt được lộ trình." });
      return;
    }
    setBusyId(plan.id);
    setProblem(null);
    const result = await sendGoalAction(persona.cif, { type: "setRoadmap", goalId, planId: plan.id, planName: plan.name, milestones });
    setBusyId(null);
    if (!result.ok) {
      setProblem({ planId: plan.id, text: result.error });
      return;
    }
    markApplied(planKey(plan));
    setAppliedId(plan.id);
  }

  // saving a roadmap is independent of the conversation: only an action in flight blocks the buttons
  const labelFor = (plan: PlanOption) => (busyId === plan.id ? "Đang đặt lộ trình…" : appliedId === plan.id ? "Đã đặt lộ trình" : "Chọn phương án này");
  return (
    <div className={cn("shadow-card mt-2 flex flex-col gap-3 rounded-2xl bg-surface p-3", fullWidth ? "w-full" : "w-[85%]")}>
      <p className="break-words text-sm font-semibold text-text">{ui.title}</p>
      {ui.plans.map((p) => (
        <PlanSection
          key={p.id}
          plan={p}
          initiallyOpen={p.id === openId}
          canChoose={goalId !== undefined}
          disabled={busyId !== null || appliedId === p.id}
          buttonLabel={labelFor(p)}
          error={problem?.planId === p.id ? problem.text : null}
          onPick={(plan) => void pick(plan)}
        />
      ))}
    </div>
  );
}
