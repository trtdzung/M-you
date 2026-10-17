import "server-only";

import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { DEMO_NOW, currentMonthKey } from "@/lib/demo-clock";
import { readAccounts } from "@/lib/accounts-store";
import { readCategories } from "@/lib/categories-store";
import { readCorrections } from "@/lib/corrections-store";
import { getDb } from "@/lib/db";
import { readJarConfig } from "@/lib/jars-store";
import { readManualTxns } from "@/lib/manual-txns-store";
import { readTransactions } from "@/lib/transactions-store";
import { applyCorrections, isHidden } from "@/state/corrections-core";
import { jarPlanCandidates, resolvePriority, spendingPressureCandidates } from "@/insights/proactive/core";
import { productOpportunityCandidate } from "@/insights/proactive/opportunity";
import { recordInsightEvent, syncSelectedInsight } from "@/insights/proactive/store";
import { readFinancialProfile } from "@/lib/proactive-profile-store";
import { PERSONA_LIST } from "@/providers/mock/personas";

export function isDemoCif(cif: string): boolean {
  return PERSONA_LIST.some((p) => p.cif === cif);
}

/** Reads the same persisted account, jar, taxonomy and corrected transaction view as PFM. */
export function currentHomeInsight(cif: string, profileToken: string | null = null) {
  const month = currentMonthKey();
  const jarConfig = readJarConfig(cif);
  const accounts = readAccounts(cif);
  const categories = readCategories(cif, { includeArchived: true });
  const corrections = readCorrections(cif);
  const transactions = applyCorrections(
    [...readManualTxns(cif), ...readTransactions(cif)], corrections,
  ).filter((t) => !isHidden(corrections, t.id));
  const raw: RawData = {
    accounts, transactions, assets: [], liabilities: [], budgets: [], snapshots: [], goals: [], products: [],
  };
  const fin = computeFinancials(raw, month, { now: DEMO_NOW, transactions, jarConfig, categories });
  const candidates = [
    ...jarPlanCandidates(month, fin.jarBudget, DEMO_NOW),
    ...spendingPressureCandidates(fin),
  ];
  const profile = readFinancialProfile(cif, profileToken);
  if (profile) {
    const opportunity = productOpportunityCandidate({ fin, accounts,
      liabilities: profile.liabilities, goals: profile.goals, now: DEMO_NOW });
    if (opportunity) candidates.push(opportunity);
  }
  const selected = resolvePriority(candidates, 1)[0] ?? null;
  const result = syncSelectedInsight(getDb(), cif, selected, new Date().toISOString());
  return { ...result, month, source: "sqlite" as const };
}

export function trackHomeInsight(cif: string, id: string, version: number, event: "displayed" | "dismissed") {
  return recordInsightEvent(getDb(), cif, id, version, event, new Date().toISOString());
}
