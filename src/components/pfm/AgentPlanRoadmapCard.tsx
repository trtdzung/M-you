"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MilestoneKind, PlanOption, PlanRoadmapUi, PlanVerdict } from "@/lib/agent-plan-api";

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

function Timeline({ plan }: { plan: PlanOption }) {
  return (
    <ol className="relative mt-1 flex flex-col gap-3 border-l-2 border-border pl-4">
      {plan.milestones.map((m, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden
            data-kind={m.kind}
            className={cn("absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-2 ring-surface", DOT[m.kind])}
          />
          <p className="break-words text-xs font-bold text-text">{m.when}</p>
          <p className="break-words text-sm text-text">{m.title}</p>
          {m.detail && <p className="break-words text-xs text-muted">{m.detail}</p>}
          {m.action && (
            <p className="mt-0.5 flex items-start gap-1 text-xs font-medium text-primary-strong">
              <ArrowRight size={12} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{m.action}</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function PlanSection({
  plan,
  initiallyOpen,
  disabled,
  onChoose,
}: {
  plan: PlanOption;
  initiallyOpen: boolean;
  disabled?: boolean;
  onChoose: (text: string) => void;
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
          {plan.metrics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {plan.metrics.map((m, mi) => (
                <span key={`${mi}-${m.label}`} className="max-w-full break-words rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                  {m.label}: {m.value}
                </span>
              ))}
            </div>
          )}
          <Timeline plan={plan} />
          {plan.risk && (
            <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
              <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{plan.risk}</span>
            </p>
          )}
          {plan.choice_text && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(plan.choice_text as string)}
              className="mt-1 h-9 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              Chọn phương án này
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The `plan_roadmap` card: title, baseline and assumption chips, then one section per plan with a verdict badge, a metrics row,
 * a vertical milestone timeline, the bad-scenario risk line and a "Chọn phương án này" button that sends the plan's
 * `choice_text` as the customer's next chat message (`onChoose`). The recommended plan (else the first choosable one) starts
 * expanded; `not_recommended` plans show only name, badge, headline and reason. It never talks to the network itself.
 */
export function AgentPlanRoadmapCard({
  ui,
  disabled,
  onChoose,
  fullWidth = false,
}: {
  ui: PlanRoadmapUi;
  /** True while a message is in flight or the conversation has moved on — the choose buttons disable. */
  disabled?: boolean;
  onChoose: (text: string) => void;
  fullWidth?: boolean;
}) {
  const openId = (ui.plans.find((p) => p.verdict === "recommended") ?? ui.plans.find((p) => p.verdict !== "not_recommended"))?.id;
  return (
    <div className={cn("shadow-card mt-2 flex flex-col gap-3 rounded-2xl bg-surface p-3", fullWidth ? "w-full" : "w-[85%]")}>
      <div className="flex flex-col gap-1">
        <p className="break-words text-sm font-semibold text-text">{ui.title}</p>
        <p className="break-words text-xs text-muted">{ui.baseline}</p>
        {ui.assumptions.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {ui.assumptions.map((a, i) => (
              <span key={`${i}-${a}`} className="max-w-full break-words rounded-full bg-surface-tint px-2 py-0.5 text-[11px] text-muted">
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
      {ui.plans.map((p) => (
        <PlanSection key={p.id} plan={p} initiallyOpen={p.id === openId} disabled={disabled} onChoose={onChoose} />
      ))}
    </div>
  );
}
