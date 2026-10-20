"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { markApplied, wasApplied } from "@/lib/agent-applied";
import { fetchGoalsNames, type GoalsNames } from "@/lib/agent-goal-api";
import { usePersona } from "@/providers/context";

export const goalFieldClass =
  "w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60";

export function GoalField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
        {children}
      </label>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

export const goalCardClass = (fullWidth: boolean) =>
  cn("shadow-card flex flex-col gap-2 rounded-2xl bg-surface p-3.5", fullWidth ? "w-full" : "mt-2 w-[85%]");

export function GoalConfirmButton({ label, busyLabel, doneLabel, status, disabled, danger, onClick }: {
  label: string;
  busyLabel: string;
  doneLabel: string;
  status: GoalStatus;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status !== "idle" || disabled}
      className={cn(
        "mt-1 w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-40",
        danger ? "bg-negative text-white" : "bg-primary text-primary-fg",
      )}
    >
      {status === "done" ? doneLabel : status === "saving" ? busyLabel : label}
    </button>
  );
}

export type GoalStatus = "idle" | "saving" | "done";

/** idle → saving → done; `done` survives re-rendering the card from chat history (same tab). */
export function useGoalCardState(key: string) {
  const [status, setStatus] = useState<GoalStatus>(() => (wasApplied(key) ? "done" : "idle"));
  const [problem, setProblem] = useState<string | null>(null);
  return {
    status,
    problem,
    setProblem,
    start: () => {
      setProblem(null);
      setStatus("saving");
    },
    fail: (message: string) => {
      setStatus("idle");
      setProblem(message);
    },
    finish: () => {
      markApplied(key);
      setStatus("done");
    },
  };
}

/** A string typed into a number box → a whole number, or null when it is empty / not a number. */
export function parseWhole(raw: string): number | null {
  const text = raw.trim().replace(/[.,\s]/g, "");
  if (text === "" || !/^\d+$/.test(text)) return null;
  return Number(text);
}

/** A decimal such as a quantity or an interest rate (comma or dot), or null. */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "" || !/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** Names of the customer's goals and assets for the cards (null while loading or when unreadable). */
export function useGoalsNames(): GoalsNames | null {
  const { persona } = usePersona();
  const [names, setNames] = useState<GoalsNames | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchGoalsNames(persona.cif).then((value) => {
      if (alive) setNames(value);
    });
    return () => {
      alive = false;
    };
  }, [persona.cif]);
  return names;
}

/**
 * Which goal a card is about: `Mục tiêu: <tên>`. Shown only once the names are known; a goal the customer no longer has gets a plain
 * warning instead (the server refuses the write anyway).
 */
export function GoalLine({ goalName }: { goalName: string | null | undefined }) {
  if (goalName === undefined) return null;
  if (goalName === null) return <p className="text-xs text-negative">Không tìm thấy mục tiêu này. Có thể mục tiêu đã bị xoá.</p>;
  return <p className="text-xs text-muted">Mục tiêu: <span className="font-semibold text-text">{goalName}</span></p>;
}
