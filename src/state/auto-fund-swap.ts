/**
 * "Đổi nguồn" (H1) planning for `useAutoFund` — pure, no React. Both the banner's
 * alternatives list AND the swap itself read the SAME trigger-month snapshot with
 * the current legs excluded (G31), so what the user is offered is exactly what
 * `changeSource` will accept. Goal jars are offered but flagged: swapping to one
 * needs an explicit confirm (S3/G26); ineligible donors (no limit, the target
 * itself) are never offered nor accepted (G27).
 */

import type { JarRole } from "@/domain/models";
import type { DonorProposal } from "@/domain/engine";
import { overspendOf, snapshotForDate, type AutoFundDeps, type JarSnapshot } from "@/lib/auto-fund-core";
import { donorEligibility, triggerContribution } from "./auto-fund-plan";

export interface SwapRequest {
  triggerTxnId: string;
  targetJarId: string;
  postedAt: string;
  /** The legs currently funding the trigger (replaced by the swap). */
  oldIds: string[];
}

export interface SwapOption {
  jarId: string;
  label: string;
  spendable: number;
  role?: JarRole;
  /** A protected goal jar — the UI must confirm before swapping to it. */
  isGoal: boolean;
}

/** The shortfall a swap must cover + the snapshot it's measured on. */
function swapBasis(deps: AutoFundDeps, p: SwapRequest): { snapshot: JarSnapshot; shortfall: number } {
  const excludeIds = new Set(p.oldIds);
  const snapshot = snapshotForDate(deps, p.postedAt, { excludeIds });
  const overspend = overspendOf(snapshot.lines, p.targetJarId);
  const cap = triggerContribution(deps, p.triggerTxnId, p.targetJarId, { excludeIds });
  return { snapshot, shortfall: cap == null ? overspend : Math.min(overspend, cap) };
}

/** Donors that could fully cover the swap on their own (goal jars flagged, not hidden). */
export function swapOptionsFor(deps: AutoFundDeps, p: SwapRequest): { shortfall: number; options: SwapOption[] } {
  const { snapshot, shortfall } = swapBasis(deps, p);
  if (shortfall <= 0) return { shortfall: 0, options: [] };
  const options = snapshot.spendables
    .filter((j) => donorEligibility(snapshot, p.targetJarId, j.id, true) === "ok")
    .filter((j) => (j.spendable ?? 0) >= shortfall)
    .map((j) => ({ jarId: j.id, label: j.label, spendable: j.spendable ?? 0, role: j.role, isGoal: j.role === "goal" }));
  return { shortfall, options };
}

export type SwapStatus = "swapped" | "needs-goal" | "ineligible" | "insufficient" | "nothing";

export interface SwapResult {
  status: SwapStatus;
  /** The legs now funding the trigger (the OLD ids unless `swapped`). */
  ids: string[];
  /** The new single donor (only when `swapped`). */
  donor?: DonorProposal;
  shortfall: number;
}

/**
 * Decide a swap: refuse a goal donor without `confirmGoal`, an ineligible donor,
 * or one that can't fully cover. Returns the single-leg donor to write when ok.
 */
export function planSwap(
  deps: AutoFundDeps,
  p: SwapRequest & { donorJarId: string; confirmGoal?: boolean },
): { status: Exclude<SwapStatus, "swapped"> | "ok"; donor?: DonorProposal; shortfall: number } {
  const { snapshot, shortfall } = swapBasis(deps, p);
  if (shortfall <= 0) return { status: "nothing", shortfall: 0 };
  const verdict = donorEligibility(snapshot, p.targetJarId, p.donorJarId, p.confirmGoal);
  if (verdict !== "ok") return { status: verdict, shortfall };
  const donor = snapshot.spendables.find((j) => j.id === p.donorJarId)!;
  if ((donor.spendable ?? 0) < shortfall) return { status: "insufficient", shortfall };
  return { status: "ok", shortfall, donor: { jarId: donor.id, label: `Hũ ${donor.label}`, take: shortfall } };
}
