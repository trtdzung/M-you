/**
 * Server-side assembly of the AI context. Loads a persona's data through the
 * provider interface (never fixtures directly — invariant #4) and composes the
 * deterministic financials the tools read from. Consent scopes travel with the
 * context so the pipeline can enforce access before any tool runs.
 */

import "server-only";
import { getProviders, type PersonaId } from "@/providers";
import { computeFinancials, type Financials, type RawData } from "@/domain/engine/finance-compose";
import { currentMonthKey } from "@/lib/demo-clock";
import type { ConsentScope } from "@/lib/consent";
import type { Beneficiary } from "@/domain/models";

export interface AiContext {
  personaId: PersonaId;
  monthKey: string;
  raw: RawData;
  financials: Financials;
  /** Scopes granted by the caller (client sends its consent record). */
  scopes: ConsentScope[];
  /**
   * Saved payees for transfer drafting (Level 3). Optional so read/analysis
   * contexts that never touch drafting can omit it; the draft pipeline reads
   * `?? []` and resolves recipients only from real records.
   */
  beneficiaries?: Beneficiary[];
}

/** Load raw provider data for a persona (server-side, via the interface). */
export async function loadRaw(personaId: PersonaId): Promise<RawData> {
  const p = getProviders(personaId);
  const [transactions, accounts, assets, liabilities, budgets, snapshots, goals, products] =
    await Promise.all([
      p.listTransactions(),
      p.listAccounts(),
      p.listAssets(),
      p.listLiabilities(),
      p.getBudgets(),
      p.getMonthlySnapshots(),
      p.listGoals(),
      p.listMockProducts(),
    ]);
  return { transactions, accounts, assets, liabilities, budgets, snapshots, goals, products };
}

export interface BuildContextInput {
  personaId: PersonaId;
  month?: string;
  scopes?: ConsentScope[];
}

/** Build the AiContext consumed by the assistant pipeline and tools. */
export async function buildAiContext(input: BuildContextInput): Promise<AiContext> {
  const monthKey = input.month || currentMonthKey();
  const raw = await loadRaw(input.personaId);
  const financials = computeFinancials(raw, monthKey);
  const beneficiaries = await getProviders(input.personaId).listBeneficiaries();
  return {
    personaId: input.personaId,
    monthKey,
    raw,
    financials,
    scopes: input.scopes ?? [],
    beneficiaries,
  };
}
