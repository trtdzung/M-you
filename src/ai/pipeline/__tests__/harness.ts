/** Shared test harness for pipeline suites (not a test file itself). */

import { getProviders, type PersonaId } from "@/providers";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { currentMonthKey } from "@/lib/demo-clock";
import type { AiContext } from "@/ai/server/load-financials";
import type { ConsentScope } from "@/lib/consent";
import type { LlmClient, LlmStreamEvent } from "@/ai/llm/types";
import type { AssistantEvent } from "../events";
import type { ChatMessage } from "../orchestrator";

export const ALL_SCOPES: ConsentScope[] = ["transactions", "assets", "liabilities", "ai"];

export async function makeCtx(overrides: Partial<AiContext> = {}, personaId: PersonaId = "stable"): Promise<AiContext> {
  const p = getProviders(personaId);
  const [transactions, accounts, assets, liabilities, budgets, snapshots, goals, products] =
    await Promise.all([
      p.listTransactions(), p.listAccounts(), p.listAssets(), p.listLiabilities(),
      p.getBudgets(), p.getMonthlySnapshots(), p.listGoals(), p.listMockProducts(),
    ]);
  const raw: RawData = { transactions, accounts, assets, liabilities, budgets, snapshots, goals, products };
  const monthKey = currentMonthKey();
  return { personaId, monthKey, raw, financials: computeFinancials(raw, monthKey), scopes: ALL_SCOPES, ...overrides };
}

export function mockClient(script: LlmStreamEvent[][]): LlmClient {
  let turn = 0;
  return {
    provider: "mock",
    model: "mock",
    async *streamMessage() {
      const events = script[Math.min(turn, script.length - 1)];
      turn += 1;
      for (const e of events) yield e;
    },
  };
}

export async function collect(gen: AsyncGenerator<AssistantEvent>): Promise<AssistantEvent[]> {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

export const ask = (content: string): ChatMessage[] => [{ role: "user", content }];

export function textOf(events: AssistantEvent[]): string {
  return events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
}
