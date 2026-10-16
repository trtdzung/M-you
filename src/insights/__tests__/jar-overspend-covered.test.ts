import { describe, expect, it } from "vitest";
import type { Transaction } from "@/domain/models";
import { jarOverspendCovered } from "../detectors/jar-overspend-covered";
import { numbersIn, factValues } from "../narrate";
import type { Insight } from "../types";
import { makeFinancials, makeJarBudgetLine, makeJarBudgetResult } from "./helpers";

/**
 * `jarOverspendCovered` (RT-fix Phase 07): the "vượt-hũ-đã-bù" + C5 "cần bù thủ
 * công" detector. Both shapes read straight off `jarRebalances` (the ledger) and
 * `jarBudget.lines` — never fabricated — so every money-scale number must trace to
 * a sourceFact (same convention as `jar-pressure.test.ts`).
 */

/** Money-scale numbers (>=1000, non-year) in the explanation must be grounded. */
function assertGrounded(insight: Insight) {
  const facts = factValues(insight);
  for (const n of numbersIn(insight.explanation)) {
    const isYear = n >= 1900 && n <= 2100;
    if (n >= 1000 && !isYear) expect(facts, `${n} not grounded in "${insight.explanation}"`).toContain(n);
  }
}

let seq = 0;
function rebalanceTxn(over: Partial<Transaction> & { fromJarId: string; toJarId: string; origin?: "auto" | "manual" }): Transaction {
  seq += 1;
  return {
    id: over.id ?? `reb${seq}`,
    accountId: "acc",
    postedAt: over.postedAt ?? "2026-06-10T10:00:00.000Z",
    amount: over.amount ?? 100_000,
    currency: "VND",
    direction: "debit",
    type: "transfer",
    merchantName: "Điều chỉnh hũ",
    merchantNormalizedName: "dieu chinh hu",
    categoryId: "dieu-chinh-hu",
    status: "posted",
    source: over.source ?? "mock",
    isRecurring: false,
    userEdited: false,
    rebalance: {
      fromJarId: over.fromJarId,
      toJarId: over.toJarId,
      triggerTxnId: over.id ? `trig-${over.id}` : `trig${seq}`,
      origin: over.origin ?? "auto",
    },
  };
}

describe("jarOverspendCovered — COVERED shape (a jar that received a covering rebalance this period)", () => {
  it("reports the overspend + covering donor(s), grounded, sourced from jarRebalances + the jar's own line", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({
              huId: "food",
              label: "Ăn uống",
              spent: 4_800_000,
              limit: 4_000_000,
              limitState: "set",
              status: "ok", // already folded post-rebalance — remaining is non-negative
              remaining: 0,
            }),
          ],
        }),
        jarRebalances: [rebalanceTxn({ fromJarId: "buf", toJarId: "food", amount: 800_000, origin: "auto" })],
      }),
    );

    expect(insights).not.toBeNull();
    const insight = insights!.find((i) => i.type === "jar_overspend_covered");
    expect(insight).toBeDefined();
    expect(insight!.id).toBe("jarOverspendCovered:2026-06:food");
    expect(insight!.severity).toBe("attention");
    expect(insight!.actionType).toBe("review_jars");
    expect(insight!.title).toBe('Vượt hũ "Ăn uống" đã được bù');
    expect(insight!.explanation).toContain("800.000");
    assertGrounded(insight!);

    // Donor provenance (invariant #5, Minor-1): the origin is carried in the facts,
    // never presented as user-typed when the engine auto-applied it.
    const donorFact = insight!.sourceFacts.find((f) => f.label.includes("Bù từ"));
    expect(donorFact?.label).toContain("tự động");
    expect(donorFact?.value).toBe(800_000);
  });

  it("aggregates multiple donors covering the SAME jar into one insight with all origins traced", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 5_500_000, limit: 4_000_000, remaining: 0 })],
        }),
        jarRebalances: [
          rebalanceTxn({ id: "r1", fromJarId: "buf", toJarId: "food", amount: 1_000_000, origin: "auto" }),
          rebalanceTxn({ id: "r2", fromJarId: "goal", toJarId: "food", amount: 500_000, origin: "manual" }),
        ],
      }),
    );

    const insight = insights!.find((i) => i.type === "jar_overspend_covered")!;
    const covered = insight.sourceFacts.find((f) => f.label === "Đã bù");
    expect(covered?.value).toBe(1_500_000); // sums both donors
    expect(insight.sourceFacts.some((f) => f.label.includes("tự động"))).toBe(true);
    expect(insight.sourceFacts.some((f) => f.label.includes("thủ công"))).toBe(true);
    assertGrounded(insight);
  });

  it("a jar→pool lift (toJarId 'pool') is never reported as a covered overspend", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 1_000_000, limit: 4_000_000, remaining: 3_000_000 })],
        }),
        jarRebalances: [rebalanceTxn({ fromJarId: "food", toJarId: "pool", amount: 200_000, origin: "auto" })],
      }),
    );
    expect(insights).toBeNull();
  });
});

describe("jarOverspendCovered — C5 RESIDUAL shape (over-budget jar with NO covering rebalance)", () => {
  it("surfaces the durable 'cần bù thủ công' state for an unfunded over-budget jar", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({
              huId: "food",
              label: "Ăn uống",
              spent: 4_800_000,
              limit: 4_000_000,
              limitState: "set",
              status: "over",
              remaining: -800_000,
            }),
          ],
        }),
        jarRebalances: [], // declined goal-confirm — nothing was written (C5)
      }),
    );

    expect(insights).not.toBeNull();
    const insight = insights!.find((i) => i.type === "jar_needs_manual_cover");
    expect(insight).toBeDefined();
    expect(insight!.id).toBe("jarNeedsManualCover:2026-06:food");
    expect(insight!.severity).toBe("attention");
    expect(insight!.title).toBe('Hũ "Ăn uống" cần bù thủ công');
    const shortfallFact = insight!.sourceFacts.find((f) => f.label === "Cần bù");
    expect(shortfallFact?.value).toBe(800_000);
    assertGrounded(insight!);
  });

  it("does NOT report the residual state for a jar that WAS already covered (no double-report)", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 4_800_000, limit: 4_000_000, remaining: 0 })],
        }),
        jarRebalances: [rebalanceTxn({ fromJarId: "buf", toJarId: "food", amount: 800_000, origin: "auto" })],
      }),
    );
    const residual = insights!.find((i) => i.type === "jar_needs_manual_cover");
    expect(residual).toBeUndefined();
  });

  it("returns null for an over-budget jar with no limit set (never a fabricated shortfall)", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 1_000_000, limit: null, limitState: "unset", remaining: null })],
        }),
        jarRebalances: [],
      }),
    );
    expect(insights).toBeNull();
  });

  it("returns null when every jar is within budget and nothing was rebalanced", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 1_000_000, limit: 4_000_000, remaining: 3_000_000 })],
        }),
        jarRebalances: [],
      }),
    );
    expect(insights).toBeNull();
  });
});

describe("jarOverspendCovered — pool cover leg (S2/G01/M05)", () => {
  it("a pool-covered jar reads as COVERED from 'Chưa phân bổ', never 'cần bù thủ công'", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 150_000, limit: 100_000, limitState: "set", remaining: 0 }),
          ],
        }),
        jarRebalances: [rebalanceTxn({ fromJarId: "pool", toJarId: "food", amount: 50_000, origin: "auto" })],
      }),
    );
    expect(insights).not.toBeNull();
    expect(insights!.some((i) => i.type === "jar_needs_manual_cover")).toBe(false);
    const covered = insights!.find((i) => i.type === "jar_overspend_covered")!;
    expect(covered.explanation).toContain('"Chưa phân bổ"');
    expect(covered.explanation).not.toContain('"pool"');
    expect(covered.sourceFacts.some((f) => f.label === 'Bù từ "Chưa phân bổ" (tự động)')).toBe(true);
    assertGrounded(covered);
  });

  it("a donor jar no longer in config reads as 'hũ đã xoá', never a raw id", () => {
    const insights = jarOverspendCovered(
      makeFinancials({
        jarBudget: makeJarBudgetResult({
          lines: [makeJarBudgetLine({ huId: "food", label: "Ăn uống", spent: 150_000, limit: 100_000, limitState: "set", remaining: 0 })],
        }),
        jarRebalances: [rebalanceTxn({ fromJarId: "gone-123", toJarId: "food", amount: 50_000 })],
      }),
    );
    const covered = insights!.find((i) => i.type === "jar_overspend_covered")!;
    expect(covered.explanation).toContain('"hũ đã xoá"');
    expect(covered.explanation).not.toContain("gone-123");
  });
});
