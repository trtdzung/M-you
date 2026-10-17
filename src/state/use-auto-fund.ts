"use client";

/**
 * The ONE shared auto-fund unit (plan 260918-1120, Phases 04/05) — Case 1
 * (jar-sourced transfer confirm) and Case 2 (spend-first, categorize-later) both
 * call this so the funding + `dieu-chinh-hu` rebalance mechanic lives in one place
 * (DRY). It wraps the pure core (`auto-fund-core.ts`, `auto-fund-plan.ts`,
 * `auto-fund-swap.ts`) with the manual-txns store:
 *
 *  - `assess` / `snapshotAt`  pre-commit verdict / snapshot on the trigger-date month.
 *  - `commit` / `commitPersisted`  write one rebalance txn per donor (the latter
 *                    AWAITS persistence and rolls back on failure — H14/U1).
 *  - `fundJar`       Case 2: fund a jar that just went over-budget from a label,
 *                    capped at the trigger's own contribution (U5); partial
 *                    cover + residual when full cover is impossible.
 *  - `reconcile`     H3/H5: unwind + re-evaluate a changed trigger txn.
 *  - `reconcileLabels` S7/U4: batch-fund background auto-labels, each fund seeing
 *                    the legs written before it (no double-funding in a batch).
 *
 * There is deliberately NO undo / change-source here: the post-fund banner is
 * read-only, so a rebalance is corrected by re-categorising the trigger txn
 * (`reconcile` unwinds its legs and re-funds), never by editing legs directly.
 *
 * Invariants: engine is sole truth (#1), rebalances are virtual/no OTP (#3),
 * excluded from thu/chi (#6), and carry `origin` provenance (#5).
 */

import { useCallback, useMemo } from "react";
import type { Transaction } from "@/domain/models";
import { evaluateFunding, type DonorProposal, type FundingAssessment } from "@/domain/engine";
import { DEMO_NOW } from "@/lib/demo-clock";
import { jarIdForCategory, rebalanceInputsFor, snapshotForDate, type AutoFundDeps, type JarSnapshot } from "@/lib/auto-fund-core";
import type { RawData } from "@/domain/engine/finance-compose";
import { planCover, triggerContribution, type SnapshotOpts } from "./auto-fund-plan";
import { useFinancials } from "./useFinancials";
import { useJarConfig } from "./jars";
import { buildManualTxn, useManualTxns } from "./manual-txns";

export type FundStatus = "covered" | "funded" | "insufficient";

export interface FundResult {
  status: FundStatus;
  /** The donors actually written (`funded`/partial `insufficient`). */
  donors: DonorProposal[];
  /** VND still uncovered for `insufficient` (after any partial cover); the gap otherwise. */
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
}

type Origin = "auto" | "manual";

/** Hook body, fed an already-loaded txn view (so a provider that already calls
 *  `useFinancials` — e.g. auto-categorize — doesn't start a second data fetch). */
export function useAutoFundWith(fin: { transactions: Transaction[]; raw: RawData | null }) {
  const { transactions, raw } = fin;
  const { config: jarConfig } = useJarConfig();
  const { add, remove, removeByTrigger, addPersisted } = useManualTxns();

  const deps: AutoFundDeps = useMemo(
    () => ({ transactions, accounts: raw?.accounts ?? [], jarConfig, now: DEMO_NOW }),
    [transactions, raw, jarConfig],
  );

  const snapshotAt = useCallback((postedAt: string, opts?: SnapshotOpts): JarSnapshot => snapshotForDate(deps, postedAt, opts), [deps]);

  /** Pre-commit funding verdict (C3/H6): assess BEFORE any spend is booked. */
  const assess = useCallback(
    (p: { postedAt: string; sourceJarId: string | null; amount: number }) => {
      const snapshot = snapshotForDate(deps, p.postedAt);
      const assessment = evaluateFunding({ amount: p.amount, sourceJarId: p.sourceJarId, casaBalance: snapshot.casaBalance, jars: snapshot.spendables });
      return { assessment, snapshot };
    },
    [deps],
  );

  /** Write legs synchronously (optimistic); compensating remove on a synchronous throw. */
  const writeLegs = useCallback(
    (donors: DonorProposal[], targetJarId: string | null, triggerTxnId: string, postedAt: string, origin: Origin) => {
      const inputs = rebalanceInputsFor(donors, targetJarId, triggerTxnId, postedAt, origin);
      const created: string[] = [];
      try {
        for (const input of inputs) created.push(add(input));
      } catch (err) {
        created.forEach(remove);
        throw err;
      }
      const legs = inputs.map((input, i) => ({ ...buildManualTxn(input), id: created[i] }));
      return { ids: created, legs };
    },
    [add, remove],
  );

  /** Write one `dieu-chinh-hu` rebalance txn per donor from an assessment (optimistic). */
  const commit = useCallback(
    (p: CommitInput): string[] => writeLegs(p.assessment.donors, p.targetJarId, p.triggerTxnId, p.postedAt, p.origin).ids,
    [writeLegs],
  );

  /**
   * Like `commit`, but AWAITS every leg's persistence (H14/U1). If any leg fails,
   * the ones that did land are removed and the promise rejects — the caller must
   * surface it, never report the cover as done.
   */
  const commitPersisted = useCallback(
    async (p: CommitInput): Promise<string[]> => {
      const inputs = rebalanceInputsFor(p.assessment.donors, p.targetJarId, p.triggerTxnId, p.postedAt, p.origin);
      const settled = await Promise.allSettled(inputs.map((input) => addPersisted(input)));
      const ok = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) {
        ok.forEach(remove);
        throw failed.reason instanceof Error ? failed.reason : new Error("rebalance write failed");
      }
      return ok;
    },
    [addPersisted, remove],
  );

  /** Plan + write a cover for one trigger against `d` (lets a batch thread its own legs). */
  const fundWith = useCallback(
    (
      d: AutoFundDeps,
      p: { targetJarId: string; triggerTxnId: string; postedAt: string; origin: Origin } & SnapshotOpts,
    ): { result: FundResult; legs: Transaction[] } => {
      const opts = { excludeIds: p.excludeIds, overrides: p.overrides };
      const snapshot = snapshotForDate(d, p.postedAt, opts);
      const targetLabel = snapshot.lines.find((l) => l.huId === p.targetJarId)?.label ?? "hũ";
      const cap = triggerContribution(d, p.triggerTxnId, p.targetJarId, opts);
      const plan = planCover(snapshot, p.targetJarId, cap);
      const base = { targetJarId: p.targetJarId, targetLabel, postedAt: p.postedAt };
      if (plan.status === "covered") return { result: { ...base, status: "covered", donors: [], shortfall: 0, createdIds: [] }, legs: [] };
      const { ids, legs } = writeLegs(plan.donors, p.targetJarId, p.triggerTxnId, p.postedAt, p.origin);
      const shortfall = plan.status === "funded" ? plan.shortfall : plan.residual;
      return { result: { ...base, status: plan.status, donors: plan.donors, shortfall, createdIds: ids }, legs };
    },
    [writeLegs],
  );

  /**
   * Case 2 / reconcile core: fund a jar over-budget in the trigger-period snapshot,
   * capped at the trigger's own contribution (U5). `insufficient` writes the best
   * PARTIAL cover and reports the residual (C5 "cần bù thủ công").
   */
  const fundJar = useCallback(
    (p: { targetJarId: string; triggerTxnId: string; postedAt: string; origin: Origin } & SnapshotOpts): FundResult => {
      return fundWith(deps, p).result;
    },
    [deps, fundWith],
  );

  /** H3/H5: unwind a changed trigger's legs, then re-fund against its CURRENT category. */
  const reconcile = useCallback(
    (p: { triggerTxnId: string; categoryId: string; postedAt: string; origin?: Origin; override?: Partial<Transaction> }): FundResult | null => {
      const removed = removeByTrigger(p.triggerTxnId);
      const targetJarId = jarIdForCategory(jarConfig, p.categoryId);
      if (!targetJarId) return null; // transfer/rebalance category maps to no jar
      return fundJar({
        targetJarId,
        triggerTxnId: p.triggerTxnId,
        postedAt: p.postedAt,
        origin: p.origin ?? "auto",
        excludeIds: new Set(removed),
        overrides: p.override ? new Map([[p.triggerTxnId, p.override]]) : undefined,
      });
    },
    [removeByTrigger, jarConfig, fundJar],
  );

  /**
   * S7/U4: background labels just landed (not yet re-rendered). Fund each labelled
   * txn's jar in date order; every fund sees the category `overrides` AND the legs
   * already written earlier in this batch, so two labels in one jar never both
   * claim the same overspend or the same donor money. What can't be covered stays
   * a visible "cần bù thủ công" residual.
   */
  const reconcileLabels = useCallback(
    (labels: { txnId: string; categoryId: string }[]): FundResult[] => {
      const overrides = new Map<string, Partial<Transaction>>(labels.map((l) => [l.txnId, { categoryId: l.categoryId }]));
      const byId = new Map(deps.transactions.map((t) => [t.id, t]));
      // Unique, known (non-hidden) triggers, oldest first.
      const ordered = [...new Map(labels.map((l) => [l.txnId, l])).values()]
        .filter((l) => byId.has(l.txnId))
        .sort((a, b) => (byId.get(a.txnId)!.postedAt < byId.get(b.txnId)!.postedAt ? -1 : 1));
      let extra: Transaction[] = [];
      const excludeIds = new Set<string>();
      const results: FundResult[] = [];
      for (const l of ordered) {
        const targetJarId = jarIdForCategory(jarConfig, l.categoryId);
        if (!targetJarId) continue;
        removeByTrigger(l.txnId).forEach((id) => excludeIds.add(id));
        const d = { ...deps, transactions: [...extra, ...deps.transactions] };
        const postedAt = byId.get(l.txnId)!.postedAt;
        const { result, legs } = fundWith(d, { targetJarId, triggerTxnId: l.txnId, postedAt, origin: "auto", excludeIds, overrides });
        extra = [...legs, ...extra];
        if (result.status !== "covered") results.push(result);
      }
      return results;
    },
    [deps, jarConfig, removeByTrigger, fundWith],
  );

  return useMemo(
    () => ({ assess, snapshotAt, commit, commitPersisted, fundJar, reconcile, reconcileLabels, removeByTrigger, jarConfig }),
    [assess, snapshotAt, commit, commitPersisted, fundJar, reconcile, reconcileLabels, removeByTrigger, jarConfig],
  );
}

/** The shared auto-fund unit over the app's merged txn view. */
export function useAutoFund() {
  const { transactions, raw } = useFinancials();
  return useAutoFundWith({ transactions, raw });
}
