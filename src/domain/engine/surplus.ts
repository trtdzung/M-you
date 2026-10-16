/**
 * Level 3 surplus allocation — a deterministic "phân bổ thặng dư" what-if. No
 * AI: the engine owns every number; a UI simulates distributing the month's
 * surplus into savings goals. Read-only simulation — it never moves money, never
 * prepares a draft, and never mutates a goal.
 *
 * Surplus formula (Red Team M12 — concretely defined, not "TBD"):
 *   surplus = income === "unknown" ? "unknown" : max(0, income − expense)
 * where `income` is the SAME resolved monthly basis the jars use
 * (`jarIncomeBasis`) and `expense` is posted, transfer-excluded spend. An unknown
 * income yields an UNKNOWN surplus, never 0 (Security-F6, invariant #6).
 */

import type { DataSource, Goal } from "@/domain/models";

export type SurplusValue = number | "unknown";

export interface SurplusTarget {
  goalId: string;
  goalName: string;
  /** What the UI asked to put here, after sanitising (finite, >= 0). */
  requested: number;
  /** Actually applied: capped at the goal's headroom and the surplus left. */
  amount: number;
  currentAmount: number;
  targetAmount: number;
  /** currentAmount + amount (never past targetAmount). */
  projectedAmount: number;
  reachesTarget: boolean;
}

export interface SurplusPlan {
  surplus: SurplusValue;
  /** Total applied across targets (0 when surplus is unknown). */
  allocated: number;
  /** surplus − allocated, floored at 0; "unknown" when surplus is unknown. */
  remaining: SurplusValue;
  targets: SurplusTarget[];
  meta: { source: DataSource };
}

/** Monthly surplus. Income unknown → surplus unknown, NEVER 0 (Security-F6). */
export function computeSurplus(income: SurplusValue, expense: number): SurplusValue {
  if (income === "unknown") return "unknown";
  return Math.max(0, income - expense);
}

export interface SurplusSimInput {
  surplus: SurplusValue;
  goals: Goal[];
  /** Desired VND per goal id (from the UI); missing/invalid is treated as 0. */
  split: Record<string, number>;
}

/** Sanitise a requested amount: non-finite / negative → 0; otherwise rounded VND. */
function clean(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/**
 * Simulate distributing `surplus` across `goals` per the UI's `split`. Each
 * target is capped so it can never overfund a goal past its target, nor draw
 * more than the surplus still unallocated (goals are filled in array order).
 * Pure — no mutation, no side effects.
 */
export function simulateSurplusAllocation({ surplus, goals, split }: SurplusSimInput): SurplusPlan {
  const meta = { source: "estimated" as DataSource };

  if (surplus === "unknown") {
    return {
      surplus: "unknown",
      allocated: 0,
      remaining: "unknown",
      targets: goals.map((g) => ({
        goalId: g.id,
        goalName: g.name,
        requested: clean(split[g.id]),
        amount: 0,
        currentAmount: g.currentAmount,
        targetAmount: g.targetAmount,
        projectedAmount: g.currentAmount,
        reachesTarget: g.currentAmount >= g.targetAmount,
      })),
      meta,
    };
  }

  let left = surplus;
  const targets: SurplusTarget[] = goals.map((g) => {
    const requested = clean(split[g.id]);
    const headroom = Math.max(0, g.targetAmount - g.currentAmount);
    const amount = Math.max(0, Math.min(requested, headroom, left));
    left -= amount;
    const projectedAmount = g.currentAmount + amount;
    return {
      goalId: g.id,
      goalName: g.name,
      requested,
      amount,
      currentAmount: g.currentAmount,
      targetAmount: g.targetAmount,
      projectedAmount,
      reachesTarget: projectedAmount >= g.targetAmount,
    };
  });

  const allocated = targets.reduce((s, t) => s + t.amount, 0);
  return { surplus, allocated, remaining: Math.max(0, surplus - allocated), targets, meta };
}
