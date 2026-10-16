"use client";

/**
 * The ONE shared auto-fund unit (plan 260918-1120, Phases 04/05) — Case 1
 * (jar-sourced transfer confirm) and Case 2 (spend-first, categorize-later) both
 * call this so the funding + `dieu-chinh-hu` rebalance mechanic lives in one place
 * (DRY). It wraps the pure core (`auto-fund-core.ts`) with the manual-txns store:
 *
 *  - `assess`        pre-commit funding verdict on the trigger-date snapshot (C3/H6).
 *  - `commit`        write one rebalance txn per JAR donor (atomic + compensating).
 *  - `fundJar`       Case 2: fund a jar that just went over-budget from a label.
 *  - `reconcile`     H3/H5: unwind + re-evaluate a refunded / re-amounted / re-
 *                    categorized trigger txn (shrink/grow/remove — no blanket delete).
 *  - `undo`          C4: remove a fund AND re-validate the target (never rest negative).
 *  - `changeSource`  H1: atomically swap the donor (new legs first, then drop old).
 *
 * Invariants: engine is sole truth (#1), rebalances are virtual/no OTP (#3),
 * excluded from thu/chi (#6), and carry `origin` provenance (#5).
 */

import { useCallback, useMemo } from "react";
import type { Transaction } from "@/domain/models";
import {
  evaluateFunding,
  type DonorProposal,
  type FundingAssessment,
} from "@/domain/engine";
import { DEMO_NOW } from "@/lib/demo-clock";
import {
  jarIdForCategory,
  overspendOf,
  rebalanceInputsFor,
  snapshotForDate,
  type AutoFundDeps,
  type JarSnapshot,
} from "@/lib/auto-fund-core";
import { useFinancials } from "./useFinancials";
import { useJarConfig } from "./jars";
import { useManualTxns } from "./manual-txns";

export type FundStatus = "covered" | "funded" | "needs-goal" | "insufficient";

export interface FundResult {
  status: FundStatus;
  donors: DonorProposal[];
  goalDonors: DonorProposal[];
  shortfall: number;
  createdIds: string[];
  targetJarId: string | null;
  targetLabel: string;
  postedAt: string;
}

export interface CommitInput {
  assessment: FundingAssessment;
  targetJarId: string | null;
  triggerTxnId: string;
  postedAt: string;
  origin: "auto" | "manual";
  includeGoal?: boolean;
}

export function useAutoFund() {
  const { transactions, raw } = useFinancials();
  const { config: jarConfig } = useJarConfig();
  const { add, remove, removeByTrigger } = useManualTxns();

  const deps: AutoFundDeps = useMemo(
    () => ({ transactions, accounts: raw?.accounts ?? [], jarConfig, now: DEMO_NOW }),
    [transactions, raw, jarConfig],
  );

  /** Pre-commit funding verdict (C3/H6): assess BEFORE any spend is booked. */
  const assess = useCallback(
    (p: { postedAt: string; sourceJarId: string | null; amount: number }) => {
      const snapshot: JarSnapshot = snapshotForDate(deps, p.postedAt);
      const assessment = evaluateFunding({
        amount: p.amount,
        sourceJarId: p.sourceJarId,
        casaBalance: snapshot.casaBalance,
        jars: snapshot.spendables,
      });
      return { assessment, snapshot };
    },
    [deps],
  );

  /**
   * Write one `dieu-chinh-hu` rebalance txn per JAR donor from an assessment.
   * All legs go in one try; if `add` throws SYNCHRONOUSLY (e.g. a bad input), the
   * compensating `remove` drops the legs already created so no jar is left
   * half-funded. NOTE: `add` is optimistic — it commits local state and fires
   * `apiCreate(...).catch(log)` in the background, so an async PERSISTENCE failure
   * does NOT reach this catch. That case is not silently lost: a re-fetch drops the
   * unpersisted leg and the C5 residual detector (`jarOverspendCovered`) re-flags the
   * jar as "cần bù thủ công". True cross-leg write atomicity is out of scope for the
   * prototype (SQLite dev, single user) — see plan 260918-1120 phase-04 H1/H2.
   */
  const commit = useCallback(
    (p: CommitInput): string[] => {
      const donors = p.includeGoal
        ? [...p.assessment.donors, ...p.assessment.goalDonors]
        : p.assessment.donors;
      const inputs = rebalanceInputsFor(donors, p.targetJarId, p.triggerTxnId, p.postedAt, p.origin);
      const created: string[] = [];
      try {
        for (const input of inputs) created.push(add(input));
      } catch (err) {
        created.forEach(remove);
        throw err;
      }
      return created;
    },
    [add, remove],
  );

  /**
   * Case 2 / reconcile core: fund a jar that is over-budget in the trigger-period
   * snapshot. `requiresManualGoal` returns `needs-goal` (caller prompts, then
   * re-calls with `includeGoal`); an uncoverable residual returns `insufficient`
   * (the durable "cần bù thủ công" state, C5). Nothing is written on either.
   */
  const fundJar = useCallback(
    (p: {
      targetJarId: string;
      triggerTxnId: string;
      postedAt: string;
      origin: "auto" | "manual";
      includeGoal?: boolean;
      excludeIds?: ReadonlySet<string>;
      overrides?: Map<string, Partial<Transaction>>;
    }): FundResult => {
      const snapshot = snapshotForDate(deps, p.postedAt, { excludeIds: p.excludeIds, overrides: p.overrides });
      const line = snapshot.lines.find((l) => l.huId === p.targetJarId);
      const targetLabel = line?.label ?? "hũ";
      const shortfall = overspendOf(snapshot.lines, p.targetJarId);
      const base = { targetJarId: p.targetJarId, targetLabel, postedAt: p.postedAt, createdIds: [] as string[] };
      if (shortfall <= 0) return { ...base, status: "covered", donors: [], goalDonors: [], shortfall: 0 };

      const assessment = evaluateFunding({
        amount: shortfall,
        sourceJarId: p.targetJarId,
        casaBalance: snapshot.casaBalance,
        jars: snapshot.spendables,
      });
      if (assessment.requiresManualGoal && !p.includeGoal) {
        return { ...base, status: "needs-goal", donors: assessment.donors, goalDonors: assessment.goalDonors, shortfall };
      }
      if (assessment.tier === "insufficient" && !assessment.requiresManualGoal) {
        // True over-allocated residual (C1) — no donor, incl. goal, can close the gap.
        // A `requiresManualGoal` insufficiency is NOT terminal here: line 141 already
        // returned `needs-goal` unless the caller re-confirmed with `includeGoal`, in
        // which case we fall through to commit the goal-jar raid.
        return { ...base, status: "insufficient", donors: assessment.donors, goalDonors: assessment.goalDonors, shortfall };
      }
      const createdIds = commit({
        assessment,
        targetJarId: p.targetJarId,
        triggerTxnId: p.triggerTxnId,
        postedAt: p.postedAt,
        origin: p.origin,
        includeGoal: p.includeGoal,
      });
      const donors = p.includeGoal ? [...assessment.donors, ...assessment.goalDonors] : assessment.donors;
      return { ...base, status: "funded", donors, goalDonors: assessment.goalDonors, shortfall, createdIds };
    },
    [deps, commit],
  );

  /**
   * H3/H5: a trigger txn was refunded/reversed (`override` status), re-amounted, or
   * re-categorized. Unwind its rebalance(s) THEN re-evaluate the effective spend and
   * re-fund only the residual overspend (shrink/grow/remove — never a blanket delete).
   * `categoryId` is the trigger's CURRENT category (routes to the target jar).
   */
  const reconcile = useCallback(
    (p: {
      triggerTxnId: string;
      categoryId: string;
      postedAt: string;
      origin?: "auto" | "manual";
      includeGoal?: boolean;
      override?: Partial<Transaction>;
    }): FundResult | null => {
      const removed = removeByTrigger(p.triggerTxnId);
      const targetJarId = jarIdForCategory(jarConfig, p.categoryId);
      if (!targetJarId) return null; // transfer/rebalance category maps to no jar
      return fundJar({
        targetJarId,
        triggerTxnId: p.triggerTxnId,
        postedAt: p.postedAt,
        origin: p.origin ?? "auto",
        includeGoal: p.includeGoal,
        excludeIds: new Set(removed),
        overrides: p.override ? new Map([[p.triggerTxnId, p.override]]) : undefined,
      });
    },
    [removeByTrigger, jarConfig, fundJar],
  );

  /**
   * C4: undo the fund for a trigger, then re-validate the TARGET — if removing it
   * re-exposes an overspend, re-apply the default non-goal chain rather than rest in
   * a negative state. (The DONOR side can't go negative: returning money only lifts
   * a donor's remaining.) An uncoverable residual is left as the durable state (C5).
   */
  const undo = useCallback(
    (p: { triggerTxnId: string; targetJarId: string | null; postedAt: string }): { status: "undone" | "reapplied" | "residual" } => {
      const removed = removeByTrigger(p.triggerTxnId);
      if (!p.targetJarId) return { status: "undone" };
      const snapshot = snapshotForDate(deps, p.postedAt, { excludeIds: new Set(removed) });
      const shortfall = overspendOf(snapshot.lines, p.targetJarId);
      if (shortfall <= 0) return { status: "undone" };
      const assessment = evaluateFunding({
        amount: shortfall,
        sourceJarId: p.targetJarId,
        casaBalance: snapshot.casaBalance,
        jars: snapshot.spendables,
      });
      if (assessment.tier === "topup") {
        commit({ assessment, targetJarId: p.targetJarId, triggerTxnId: p.triggerTxnId, postedAt: p.postedAt, origin: "auto" });
        return { status: "reapplied" };
      }
      return { status: "residual" }; // durable "cần bù thủ công" surfaces on the jar
    },
    [deps, removeByTrigger, commit],
  );

  /**
   * H1 atomic "Đổi nguồn": fund the residual overspend from a chosen donor jar,
   * creating the NEW leg FIRST, then removing the OLD legs — so the jar is never
   * unfunded mid-swap. Presented donors always fully cover, so it's a single leg.
   */
  const changeSource = useCallback(
    (p: { triggerTxnId: string; targetJarId: string; postedAt: string; oldIds: string[]; donorJarId: string }): string[] => {
      const snapshot = snapshotForDate(deps, p.postedAt, { excludeIds: new Set(p.oldIds) });
      const shortfall = overspendOf(snapshot.lines, p.targetJarId);
      const donor = snapshot.spendables.find((j) => j.id === p.donorJarId);
      const available = donor?.spendable ?? 0;
      if (shortfall <= 0 || available < shortfall) return p.oldIds; // nothing to swap / can't cover → keep old intact
      const donors: DonorProposal[] = [{ jarId: p.donorJarId, label: `Hũ ${donor?.label ?? ""}`, take: shortfall }];
      const created = commit({
        assessment: { tier: "topup", shortfall, donors, goalDonors: [], requiresManualGoal: false, targetJarId: p.targetJarId, source: "mock" },
        targetJarId: p.targetJarId,
        triggerTxnId: p.triggerTxnId,
        postedAt: p.postedAt,
        origin: "manual",
      });
      p.oldIds.forEach(remove); // old dropped only AFTER the new leg exists (atomic)
      return created;
    },
    [deps, commit, remove],
  );

  return useMemo(
    () => ({ assess, commit, fundJar, reconcile, undo, changeSource, removeByTrigger, jarConfig }),
    [assess, commit, fundJar, reconcile, undo, changeSource, removeByTrigger, jarConfig],
  );
}
