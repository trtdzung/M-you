import { describe, expect, it } from "vitest";
import { getProviders } from "@/providers";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { currentMonthKey } from "@/lib/demo-clock";
import type { AiContext } from "@/ai/server/load-financials";
import type { ConsentScope } from "@/lib/consent";
import { classifyIntent, isSmalltalk } from "../intent";
import { toPlainText } from "../plain-text";
import { runAssistant, type ChatMessage } from "../orchestrator";
import type { AssistantEvent } from "../events";

const ALL_SCOPES: ConsentScope[] = ["transactions", "assets", "liabilities", "ai"];

async function makeCtx(): Promise<AiContext> {
  const p = getProviders("stable");
  const [transactions, accounts, assets, liabilities, budgets, snapshots, goals, products, beneficiaries] =
    await Promise.all([
      p.listTransactions(), p.listAccounts(), p.listAssets(), p.listLiabilities(),
      p.getBudgets(), p.getMonthlySnapshots(), p.listGoals(), p.listMockProducts(), p.listBeneficiaries(),
    ]);
  const raw: RawData = { transactions, accounts, assets, liabilities, budgets, snapshots, goals, products };
  const monthKey = currentMonthKey();
  return { personaId: "stable", monthKey, raw, financials: computeFinancials(raw, monthKey), scopes: ALL_SCOPES, beneficiaries };
}

async function collect(gen: AsyncGenerator<AssistantEvent>): Promise<AssistantEvent[]> {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const ask = (content: string): ChatMessage[] => [{ role: "user", content }];
const textOf = (events: AssistantEvent[]) =>
  events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");

describe("smalltalk classification", () => {
  it("treats short greetings and thanks as smalltalk (no tools/scopes)", () => {
    for (const t of ["chào bạn", "hello", "Hi", "cảm ơn nhé", "alo"]) {
      expect(isSmalltalk(t)).toBe(true);
      expect(classifyIntent(t).kind).toBe("smalltalk");
      expect(classifyIntent(t).needsScopes).toEqual([]);
    }
  });

  it("treats identity/capability questions as smalltalk regardless of length", () => {
    expect(classifyIntent("bạn là ai vậy").kind).toBe("smalltalk");
    expect(classifyIntent("bạn giúp được gì cho tôi").kind).toBe("smalltalk");
  });

  it("does NOT hijack a finance question that opens with a greeting", () => {
    expect(classifyIntent("Chào bạn, tháng này tôi tiêu bao nhiêu tiền vậy?").kind).toBe("explain_month");
    // Short greeting + real question (<=6 words) must still route to the finance intent.
    expect(classifyIntent("chào, tiêu nhiều nhất ở đâu?").kind).toBe("top_category");
  });

  it("does NOT let a capability phrase swallow a real transfer request", () => {
    // Finance rules win over the (substring-matching) capability patterns.
    expect(classifyIntent("bạn giúp gì để tôi chuyển 5 triệu cho Lan").kind).toBe("action_transfer");
    expect(classifyIntent("giúp tôi trả nợ thẻ tín dụng với").kind).toBe("whatif_debt");
  });

  it("still classifies real finance intents", () => {
    expect(classifyIntent("Tôi tiêu nhiều nhất vào đâu?").kind).toBe("top_category");
    expect(classifyIntent("Chuyển 5 triệu cho Lan").kind).toBe("action_transfer");
  });
});

describe("toPlainText guard", () => {
  it("strips markdown markers without touching numbers", () => {
    const md = "## Tổng quan\n- Thu nhập **20.000.000 ₫**\n- Chi `5.000.000`\n> ghi chú";
    const out = toPlainText(md);
    expect(out).not.toMatch(/[*#`>]/);
    expect(out).toContain("20.000.000 ₫");
    expect(out).toContain("5.000.000");
    expect(out).toContain("• Thu nhập");
  });
});

describe("smalltalk pipeline behavior", () => {
  it("answers a greeting briefly without dumping financial numbers (offline)", async () => {
    const ctx = await makeCtx();
    const income = ctx.financials.cashflow.income;
    const events = await collect(runAssistant({ messages: ask("chào bạn"), ctx, client: null }));
    expect(events.some((e) => e.type === "tool")).toBe(false);
    const text = textOf(events);
    expect(text).toContain("Chào");
    expect(text).not.toContain(String(income));
  });
});
