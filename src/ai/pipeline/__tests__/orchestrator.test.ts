import { describe, expect, it } from "vitest";
import { getProviders, type PersonaId } from "@/providers";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { currentMonthKey } from "@/lib/demo-clock";
import type { AiContext } from "@/ai/server/load-financials";
import type { ConsentScope } from "@/lib/consent";
import type { LlmClient, LlmStreamEvent } from "@/ai/llm/types";
import { runAssistant, type ChatMessage } from "../orchestrator";
import type { AssistantEvent } from "../events";

const ALL_SCOPES: ConsentScope[] = ["transactions", "assets", "liabilities", "ai"];

async function makeCtx(overrides: Partial<AiContext> = {}, personaId: PersonaId = "stable"): Promise<AiContext> {
  const p = getProviders(personaId);
  const [transactions, accounts, assets, liabilities, budgets, snapshots, goals, products, beneficiaries] =
    await Promise.all([
      p.listTransactions(), p.listAccounts(), p.listAssets(), p.listLiabilities(),
      p.getBudgets(), p.getMonthlySnapshots(), p.listGoals(), p.listMockProducts(), p.listBeneficiaries(),
    ]);
  const raw: RawData = { transactions, accounts, assets, liabilities, budgets, snapshots, goals, products };
  const monthKey = currentMonthKey();
  return { personaId, monthKey, raw, financials: computeFinancials(raw, monthKey), scopes: ALL_SCOPES, beneficiaries, ...overrides };
}

/** Mock client: each streamMessage call returns the next scripted turn. */
function mockClient(script: LlmStreamEvent[][]): LlmClient {
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

async function collect(gen: AsyncGenerator<AssistantEvent>): Promise<AssistantEvent[]> {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const ask = (content: string): ChatMessage[] => [{ role: "user", content }];

describe("runAssistant pipeline", () => {
  it("runs the tool-use loop and streams a grounded answer", async () => {
    const ctx = await makeCtx();
    const income = ctx.financials.cashflow.income;
    const client = mockClient([
      [{ type: "tool_use", id: "t1", name: "getMonthlyCashflow", input: {} }, { type: "done", stopReason: "tool_use" }],
      [{ type: "text", delta: `Thu nhập tháng này là ${income} ₫.` }, { type: "done", stopReason: "end" }],
    ]);
    const events = await collect(runAssistant({ messages: ask("Giải thích tháng này"), ctx, client }));

    expect(events.some((e) => e.type === "tool")).toBe(true);
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toContain(String(income));
    expect(events[events.length - 1]).toMatchObject({ type: "done" });
  });

  it("blocks a fabricated number (validator guard) instead of showing it", async () => {
    const ctx = await makeCtx();
    const client = mockClient([
      [{ type: "tool_use", id: "t1", name: "getMonthlyCashflow", input: {} }, { type: "done", stopReason: "tool_use" }],
      [{ type: "text", delta: "Số dư bí mật của bạn là 987.654.321 ₫." }, { type: "done", stopReason: "end" }],
    ]);
    const text = (await collect(runAssistant({ messages: ask("Giải thích tháng này"), ctx, client })))
      .filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).not.toContain("987");
    expect(text).toContain("chưa chắc");
  });

  it("emits a what-if chart for a simulation", async () => {
    const ctx = await makeCtx();
    const goalId = ctx.raw.goals[0].id;
    const client = mockClient([
      [{ type: "tool_use", id: "t1", name: "simulateGoal", input: { goalId, monthlyContribution: 5_000_000 } }, { type: "done", stopReason: "tool_use" }],
      [{ type: "text", delta: "Mình đã dựng dự phóng cho mục tiêu của bạn." }, { type: "done", stopReason: "end" }],
    ]);
    const events = await collect(runAssistant({ messages: ask("Bao giờ đạt mục tiêu?"), ctx, client }));
    expect(events.some((e) => e.type === "chart")).toBe(true);
  });

  it("refuses a transfer action when drafting is disabled (flag off)", async () => {
    const prev = process.env.ENABLE_TRANSFER_DRAFTING;
    process.env.ENABLE_TRANSFER_DRAFTING = "0";
    try {
      const ctx = await makeCtx();
      const events = await collect(runAssistant({ messages: ask("Chuyển 5 triệu cho Lan"), ctx, client: mockClient([[]]) }));
      expect(events.some((e) => e.type === "refusal")).toBe(true);
      const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
      expect(text).toContain("không hỗ trợ chuyển tiền");
      expect(events.some((e) => e.type === "draft")).toBe(false);
    } finally {
      process.env.ENABLE_TRANSFER_DRAFTING = prev;
    }
  });

  it("drafts (not refuses) a valid transfer with drafting ON by default", async () => {
    const ctx = await makeCtx();
    const events = await collect(runAssistant({ messages: ask("Chuyển 5 triệu cho Lan"), ctx, client: mockClient([[]]) }));
    expect(events.some((e) => e.type === "draft")).toBe(true);
    expect(events.some((e) => e.type === "refusal")).toBe(false);
  });

  it("refuses when a required scope is missing", async () => {
    const ctx = await makeCtx({ scopes: ["ai"] });
    const events = await collect(runAssistant({ messages: ask("Tôi tiêu nhiều nhất vào đâu?"), ctx, client: mockClient([[]]) }));
    expect(events.find((e) => e.type === "refusal")).toMatchObject({ reason: "scope" });
  });

  it("asks for data when a goal what-if has no goals", async () => {
    const ctx = await makeCtx();
    ctx.raw.goals = [];
    const events = await collect(runAssistant({ messages: ask("Bao giờ tôi đạt mục tiêu tiết kiệm?"), ctx, client: mockClient([[]]) }));
    expect(events.find((e) => e.type === "refusal")).toMatchObject({ reason: "insufficient_data" });
  });

  it("falls back offline (degraded) when no client is configured", async () => {
    const ctx = await makeCtx();
    const events = await collect(runAssistant({ messages: ask("Giải thích tháng này"), ctx, client: null }));
    expect(events.some((e) => e.type === "degraded")).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ type: "done", degraded: true });
  });

  it("falls back offline when the LLM throws mid-stream", async () => {
    const ctx = await makeCtx();
    const client = mockClient([[{ type: "error", message: "network down" }]]);
    const events = await collect(runAssistant({ messages: ask("Giải thích tháng này"), ctx, client }));
    expect(events.some((e) => e.type === "degraded")).toBe(true);
  });
});
