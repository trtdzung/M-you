"use client";

/**
 * Composes the Wrapped deck from the single financial source of truth. A deck built
 * before every dependent store has settled would be wrong (a late correction or
 * taxonomy would silently change it), so `loading` waits on ALL of them, and any
 * failed store surfaces as `error` with a `retry` that re-runs exactly the failed
 * loads. Consent is checked first: without the `transactions` scope nothing is read
 * into a deck. Pure derivation otherwise — `buildWrapped` owns every number.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  buildWrapped,
  wrappedEndMonthKey,
  type WrappedCoverage,
  type WrappedDeck,
  type WrappedInput,
} from "@/domain/wrapped";
import { composeFinancialHealthScore } from "@/domain/engine/health-score-compose";
import { VN_UTC_OFFSET_MS } from "@/domain/engine/types";
import type { FinancialHealthScoreResult } from "@/domain/models/health-score";
import { CONSENT_CHANGED_EVENT, getConsent, hasScope } from "@/lib/consent";
import { currentMonthKey, transferNow } from "@/lib/demo-clock";
import { useAssetLiabilities } from "./assets";
import { useCategories } from "./categories";
import { useCorrections } from "./corrections";
import { isUserOrigin } from "./corrections-core";
import { useGoals } from "./goals";
import { useJarConfig } from "./jars";
import { useManualTxns } from "./manual-txns";
import { useFinancials } from "./useFinancials";

export type WrappedStatus = "loading" | "error" | "consent" | "insufficient" | "ready";

export interface UseWrappedResult {
  status: WrappedStatus;
  /** Set for `ready` and `insufficient` (an insufficient deck has no slides); null otherwise. */
  deck: WrappedDeck | null;
  coverage: WrappedCoverage | null;
  /** Re-run every store load that failed, and the deck build itself. */
  retry: () => void;
}

function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange); // consent changed in another tab
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const hasTransactionsScope = (): boolean => hasScope(getConsent(), "transactions");

export function useWrapped(): UseWrappedResult {
  // Pinned to the current month: the health score is "as of today", whatever month another tab picked.
  const financials = useFinancials(currentMonthKey());
  const profile = useAssetLiabilities();
  const goals = useGoals();
  const jars = useJarConfig();
  const taxonomy = useCategories();
  const corrections = useCorrections();
  const manual = useManualTxns();
  const consented = useSyncExternalStore(subscribeConsent, hasTransactionsScope, () => false);
  const [buildKey, setBuildKey] = useState(0);

  const storeError = financials.error || Boolean(jars.error) || Boolean(taxonomy.error) || corrections.error;
  const loading =
    financials.loading || !jars.loaded || !taxonomy.loaded || !corrections.loaded || !manual.loaded;
  const canBuild = consented && !storeError && !loading;

  const { categories, labels } = taxonomy;
  const fixedCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.fixed).map((c) => c.id)),
    [categories],
  );
  const userCorrectedIds = useMemo(
    () =>
      new Set(
        Object.entries(corrections.corrections)
          .filter(([, correction]) => isUserOrigin(correction))
          .map(([id]) => id),
      ),
    [corrections.corrections],
  );

  // Same composition as the Home health card (`composeFinancialHealthScore`), so both show one score.
  const profileComplete = !profile.dropped && !goals.dropped;
  const { raw, financials: fin } = financials;
  const healthScore = useMemo<FinancialHealthScoreResult | null>(() => {
    if (!canBuild || !raw || !fin) return null;
    try {
      const now = transferNow();
      return composeFinancialHealthScore({
        financials: fin,
        accounts: raw.accounts,
        liabilities: [...raw.liabilities, ...profile.liabilities],
        transactions: financials.transactions,
        fixedCategoryIds,
        month: currentMonthKey(),
        profileComplete,
        now,
        asOf: new Date(now.getTime() + VN_UTC_OFFSET_MS).toISOString().slice(0, 10),
      });
    } catch (err) {
      // The health slide is optional: a failed score drops that slide, never the deck.
      console.error("Failed to compute the Wrapped health score", err);
      return null;
    }
  }, [canBuild, raw, fin, financials.transactions, profile.liabilities, fixedCategoryIds, profileComplete]);

  const built = useMemo<{ deck: WrappedDeck | null; failed: boolean }>(() => {
    if (!canBuild) return { deck: null, failed: false };
    const input: WrappedInput = {
      transactions: financials.transactions,
      jarConfig: jars.config,
      categoryLabels: labels,
      fixedCategoryIds,
      userCorrectedIds,
      endMonthKey: wrappedEndMonthKey(currentMonthKey()),
      healthScore,
    };
    try {
      return { deck: buildWrapped(input), failed: false };
    } catch (err) {
      console.error("Failed to build the Wrapped deck", err);
      return { deck: null, failed: true };
    }
    // `buildKey` is only a re-run trigger (retry after a build that threw).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBuild, buildKey, financials.transactions, jars.config, labels, fixedCategoryIds, userCorrectedIds, healthScore]);

  const { retry: retryFinancials, error: financialsError } = financials;
  const { retry: retryJars, error: jarsError } = jars;
  const { retry: retryCategories, error: categoriesError } = taxonomy;
  const { retry: retryCorrections, error: correctionsError } = corrections;
  const retry = useCallback(() => {
    setBuildKey((k) => k + 1); // also re-runs a deck build that threw
    if (financialsError) retryFinancials();
    if (jarsError) retryJars();
    if (categoriesError) retryCategories();
    if (correctionsError) retryCorrections();
  }, [
    financialsError, retryFinancials,
    jarsError, retryJars,
    categoriesError, retryCategories,
    correctionsError, retryCorrections,
  ]);

  const { deck, failed } = built;
  let status: WrappedStatus;
  if (!consented) status = "consent";
  else if (storeError || failed) status = "error";
  else if (loading || !deck) status = "loading";
  else status = deck.coverage.sufficient ? "ready" : "insufficient";

  return { status, deck, coverage: deck?.coverage ?? null, retry };
}
