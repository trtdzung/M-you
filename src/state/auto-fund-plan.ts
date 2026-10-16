/**
 * Pure planning half of `useAutoFund` (no React, no I/O) — decides WHAT to fund,
 * the hook decides WHEN and writes it. Every number comes from the engine's
 * `evaluateFunding` over a trigger-month snapshot (invariant #1).
 *
 *  - `triggerContribution` — U5: the shortfall funded for a trigger is capped at
 *    that trigger's OWN effective spend in the target jar, so re-labelling one
 *    txn never tries to re-fund the jar's older, unrelated debt.
 *  - `planCover`           — full cover, goal-confirm gate, or a PARTIAL non-goal
 *    cover with the residual reported (U5) when full cover is impossible.
 *  - `donorEligibility`    — G27/S3: the same donor gate the engine applies
 *    (the engine's `canDonate`, never the target), plus the goal-confirm rule.
 */

import type { Transaction } from "@/domain/models";
import { canDonate, evaluateFunding, type DonorProposal } from "@/domain/engine";
import { jarIdForCategory, overspendOf, type AutoFundDeps, type JarSnapshot } from "@/lib/auto-fund-core";

export interface SnapshotOpts {
  excludeIds?: ReadonlySet<string>;
  overrides?: Map<string, Partial<Transaction>>;
}

/** Σ take of a donor chain. */
function totalTake(donors: DonorProposal[]): number {
  return donors.reduce((s, d) => s + d.take, 0);
}

/**
 * The trigger's effective spend routed into `targetJarId` (after overrides). `null`
 * when the trigger isn't in the txn view (caller falls back to the full overspend);
 * 0 when it no longer contributes (refunded/reversed/pending, credit, other jar).
 */
export function triggerContribution(
  deps: AutoFundDeps,
  triggerTxnId: string,
  targetJarId: string,
  opts: SnapshotOpts = {},
): number | null {
  if (opts.excludeIds?.has(triggerTxnId)) return null;
  const base = deps.transactions.find((t) => t.id === triggerTxnId);
  if (!base) return null;
  const t = { ...base, ...opts.overrides?.get(triggerTxnId) };
  if (t.direction !== "debit") return 0;
  if (t.status && t.status !== "posted") return 0;
  if (jarIdForCategory(deps.jarConfig, t.categoryId) !== targetJarId) return 0;
  return Number.isFinite(t.amount) ? Math.abs(t.amount) : 0;
}

export type CoverPlan =
  | { status: "covered"; shortfall: 0; donors: []; goalDonors: []; residual: 0 }
  | { status: "needs-goal"; shortfall: number; donors: DonorProposal[]; goalDonors: DonorProposal[]; residual: number }
  | { status: "funded"; shortfall: number; donors: DonorProposal[]; goalDonors: DonorProposal[]; residual: 0 }
  /** `donors` is the PARTIAL non-goal cover to write (may be empty); `residual` stays uncovered. */
  | { status: "insufficient"; shortfall: number; donors: DonorProposal[]; goalDonors: DonorProposal[]; residual: number };

/**
 * Plan how to cover `targetJarId`'s overspend in `snapshot`, capped at `cap` (the
 * trigger's contribution; `null` = uncapped).
 *  - non-goal donors can cover → `funded`;
 *  - only a `goal` jar closes the gap → `needs-goal` (nothing to write) unless
 *    `includeGoal` (explicit confirm → `funded` incl. goal) or `partialOnNeedsGoal`
 *    (background mode: write the non-goal part, report the residual);
 *  - otherwise → `insufficient` with the best partial non-goal chain + residual.
 */
export function planCover(
  snapshot: JarSnapshot,
  targetJarId: string,
  cap: number | null,
  opts: { includeGoal?: boolean; partialOnNeedsGoal?: boolean } = {},
): CoverPlan {
  const overspend = overspendOf(snapshot.lines, targetJarId);
  const shortfall = cap == null ? overspend : Math.min(overspend, Math.max(0, cap));
  if (!(shortfall > 0)) return { status: "covered", shortfall: 0, donors: [], goalDonors: [], residual: 0 };

  const evaluate = (amount: number) =>
    evaluateFunding({ amount, sourceJarId: targetJarId, casaBalance: snapshot.casaBalance, jars: snapshot.spendables });
  const a = evaluate(shortfall);
  if (a.tier !== "insufficient") {
    return { status: "funded", shortfall, donors: a.donors, goalDonors: a.goalDonors, residual: 0 };
  }
  if (a.requiresManualGoal) {
    if (opts.includeGoal) {
      return { status: "funded", shortfall, donors: [...a.donors, ...a.goalDonors], goalDonors: a.goalDonors, residual: 0 };
    }
    if (!opts.partialOnNeedsGoal) {
      return { status: "needs-goal", shortfall, donors: a.donors, goalDonors: a.goalDonors, residual: shortfall - totalTake(a.donors) };
    }
    return { status: "insufficient", shortfall, donors: a.donors, goalDonors: a.goalDonors, residual: shortfall - totalTake(a.donors) };
  }
  // True over-allocated residual: nothing (incl. goal) covers it all. The engine
  // reports `shortfall − ceiling`, so `coverable` is what CAN be reached; its
  // non-goal chain is the partial cover (goal jars never raided without confirm).
  const coverable = shortfall - a.shortfall;
  const donors = coverable > 0 ? evaluate(coverable).donors : [];
  return { status: "insufficient", shortfall, donors, goalDonors: [], residual: shortfall - totalTake(donors) };
}

export type DonorVerdict = "ok" | "needs-goal" | "ineligible";

/** G27/S3: may `donorJarId` fund `targetJarId`? Same gate as the engine + goal confirm. */
export function donorEligibility(
  snapshot: JarSnapshot,
  targetJarId: string,
  donorJarId: string,
  confirmGoal = false,
): DonorVerdict {
  if (donorJarId === targetJarId) return "ineligible";
  const donor = snapshot.spendables.find((j) => j.id === donorJarId);
  if (!donor || !canDonate(donor)) return "ineligible";
  if (donor.role === "goal" && !confirmGoal) return "needs-goal";
  return "ok";
}
