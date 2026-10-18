// Active signals (business table 3, types 1-5). Pure: engine outputs in, plain facts out.
import type { Transaction } from "@/domain/models";
import type { Obligation } from "@/domain/engine/obligations";
import type { RecurringSeries } from "@/domain/engine/recurring";
import { addMonthsToKey, dateToMonthKey } from "@/domain/engine/types";
import type { GoalProgressState } from "../model/types";
import type { AdvisorGoal, AdvisorSignal } from "./types";

const SPIKE_RATIO = 1.3;
const SPIKE_MIN_DELTA = 500_000;
const IDLE_BUFFER_MONTHS = 3;
const MS_PER_DAY = 86_400_000;

export interface SignalInput {
  now: Date;
  obligations: Obligation[];
  /** Projected liquid cash at month end ("unknown" when not computable). */
  endOfMonth: number | "unknown";
  /** Net expense per category: last complete month and the one before. */
  lastMonthByCategory: Array<{ categoryId: string; amount: number }>;
  prevMonthByCategory: Array<{ categoryId: string; amount: number }>;
  labels: ReadonlyMap<string, string>;
  recurring: RecurringSeries[];
  txns: Transaction[];
  /** Cash in the payment account not claimed by any jar; null when unknown. */
  unallocatedCash: number | null;
  avgExpense: number | "unknown";
  goals: AdvisorGoal[];
}

const GOAL_STATES: ReadonlySet<GoalProgressState> = new Set(["on_track", "ahead", "slightly_behind", "off_track"]);

function spikes(i: SignalInput): AdvisorSignal[] {
  const prev = new Map(i.prevMonthByCategory.map((c) => [c.categoryId, c.amount]));
  return i.lastMonthByCategory.flatMap((c) => {
    const p = prev.get(c.categoryId) ?? 0;
    if (p <= 0 || c.amount <= p * SPIKE_RATIO || c.amount - p < SPIKE_MIN_DELTA) return [];
    return [{
      kind: "spending_spike" as const,
      categoryId: c.categoryId,
      label: i.labels.get(c.categoryId) ?? null,
      current: c.amount,
      previous: p,
      deltaPct: Math.round(((c.amount - p) / p) * 100),
    }];
  });
}

/** Subscription series whose first posting is within the last 3 complete months. */
function newSubscriptions(i: SignalInput): AdvisorSignal[] {
  const cutoff = addMonthsToKey(dateToMonthKey(i.now), -3);
  const firstMonth = new Map<string, string>();
  for (const t of i.txns) {
    const m = dateToMonthKey(new Date(t.postedAt));
    const cur = firstMonth.get(t.merchantNormalizedName);
    if (!cur || m < cur) firstMonth.set(t.merchantNormalizedName, m);
  }
  return i.recurring
    .filter((r) => r.isExpense && r.categoryId === "subscriptions" && (firstMonth.get(r.merchantNormalizedName) ?? "") >= cutoff)
    .map((r) => ({ kind: "new_subscription" as const, label: r.label, monthlyAmount: r.averageAmount, categoryId: r.categoryId }));
}

export function computeSignals(i: SignalInput): AdvisorSignal[] {
  const out: AdvisorSignal[] = [];
  for (const o of i.obligations) {
    const daysLeft = Math.max(0, Math.ceil((new Date(o.dueDate).getTime() - i.now.getTime()) / MS_PER_DAY));
    out.push({
      kind: "upcoming_obligation",
      label: o.label,
      amount: o.amount === "unknown" ? null : o.amount,
      dueDate: o.dueDate,
      daysLeft,
    });
  }
  if (i.endOfMonth !== "unknown" && i.endOfMonth < 0) out.push({ kind: "cashflow_risk", projectedEndOfMonth: i.endOfMonth });
  out.push(...spikes(i), ...newSubscriptions(i));
  // Balance history is not available, so ">90 days idle" is approximated by "above 3 months of spend".
  if (i.unallocatedCash !== null && i.avgExpense !== "unknown") {
    const idle = i.unallocatedCash - IDLE_BUFFER_MONTHS * i.avgExpense;
    if (idle > 0) out.push({ kind: "idle_cash", amount: Math.round(idle), basis: "above_3_months_expense" });
  }
  for (const g of i.goals) {
    if (GOAL_STATES.has(g.state)) out.push({ kind: "goal_progress", goalId: g.id, name: g.name, state: g.state, percent: g.percent });
  }
  return out;
}
