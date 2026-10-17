import { describe, expect, it } from "vitest";
import type { Transaction } from "@/domain/models";
import { currentMonthKey } from "@/lib/demo-clock";
import { jarPressure } from "../detectors/jar-pressure";
import { numbersIn, factValues } from "../narrate";
import type { Insight } from "../types";
import { makeFinancials, makeJarBudgetLine, makeJarBudgetResult } from "./helpers";

const THIS_MONTH = currentMonthKey();

/** Money-scale numbers (>=1000, non-year) in the explanation must be grounded. */
function assertGrounded(insight: Insight) {
  const facts = factValues(insight);
  for (const n of numbersIn(insight.explanation)) {
    const isYear = n >= 1900 && n <= 2100;
    if (n >= 1000 && !isYear) expect(facts, `${n} not grounded`).toContain(n);
  }
}

describe("jarPressure detector (BIDV wallet model — jarBudget-based)", () => {
  it("flags an over-limit SET jar as urgent", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({
              huId: "food",
              label: "Ăn uống",
              spent: 4_800_000,
              limit: 4_000_000,
              limitState: "set",
              status: "over",
              pct: 1.2,
              balance: -800_000,
              thresholdHit: true,
            }),
          ],
        }),
      }),
    );
    expect(insight?.severity).toBe("urgent");
    expect(insight?.type).toBe("jar_pressure");
    expect(insight?.actionType).toBe("review_jars");
    expect(insight?.title).toBe('Vượt hạn mức hũ "Ăn uống"');
    expect(insight?.id).toBe(`jarPressure:${THIS_MONTH}:food`);
    assertGrounded(insight!);
  });

  it("flags a near-limit SET jar (>=80% used, not over) as attention", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({
              huId: "transport",
              label: "Di chuyển",
              spent: 900_000,
              limit: 1_000_000,
              limitState: "set",
              status: "near",
              pct: 0.9,
              balance: 100_000,
              thresholdHit: true,
            }),
          ],
        }),
      }),
    );
    expect(insight?.severity).toBe("attention");
    expect(insight?.title).toBe('Sắp vượt hạn mức hũ "Di chuyển"');
    assertGrounded(insight!);
  });

  it("picks the largest breach (over jars ranked before near, by pct)", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({
              huId: "small",
              label: "Nhỏ",
              spent: 1_100_000,
              limit: 1_000_000,
              limitState: "set",
              status: "over",
              pct: 1.1,
            }),
            makeJarBudgetLine({
              huId: "big",
              label: "Lớn",
              spent: 5_000_000,
              limit: 2_000_000,
              limitState: "set",
              status: "over",
              pct: 2.5,
            }),
          ],
        }),
      }),
    );
    expect(insight?.title).toContain("Lớn");
  });

  it("returns null when an unset-limit jar (limitState 'unset', status null) has spend", () => {
    expect(
      jarPressure(
        makeFinancials({
          monthKey: THIS_MONTH,
          jarBudget: makeJarBudgetResult({
            lines: [
              makeJarBudgetLine({
                huId: "savings",
                label: "Tiết kiệm",
                spent: 3_000_000,
                limit: null,
                limitState: "unset",
                status: null,
                pct: null,
                balance: null,
              }),
            ],
          }),
        }),
      ),
    ).toBeNull();
  });

  it("returns null when every SET jar is ok (no over / near)", () => {
    expect(
      jarPressure(
        makeFinancials({
          monthKey: THIS_MONTH,
          jarBudget: makeJarBudgetResult({
            lines: [
              makeJarBudgetLine({
                huId: "food",
                spent: 1_000_000,
                limit: 4_000_000,
                limitState: "set",
                status: "ok",
                pct: 0.25,
                balance: 3_000_000,
              }),
            ],
          }),
        }),
      ),
    ).toBeNull();
  });

  it("[H2] returns null off the current month (no stale warning)", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: "2026-06",
        jarBudget: makeJarBudgetResult({
          lines: [
            makeJarBudgetLine({
              huId: "food",
              spent: 4_800_000,
              limit: 4_000_000,
              limitState: "set",
              status: "over",
              pct: 1.2,
            }),
          ],
        }),
      }),
    );
    expect(insight).toBeNull();
  });

  it("returns null when there are no jarBudget lines at all", () => {
    expect(
      jarPressure(makeFinancials({ monthKey: THIS_MONTH, jarBudget: makeJarBudgetResult({ lines: [] }) })),
    ).toBeNull();
  });

  describe("hai trục: hũ vượt kế hoạch nhưng đã được bù đủ số dư thì nhường lượt kể", () => {
    const covered = makeJarBudgetLine({
      huId: "food", label: "Ăn uống", spent: 4_800_000, limit: 4_000_000,
      limitState: "set", status: "over", pct: 1.2, rebalanceNet: 800_000,
      balance: 0, thresholdHit: true,
    });
    const short = makeJarBudgetLine({
      huId: "transport", label: "Đi lại", spent: 2_100_000, limit: 2_000_000,
      limitState: "set", status: "over", pct: 1.05, balance: -100_000, thresholdHit: true,
    });
    // The covering rebalance the engine wrote for `covered` (pool → food, 800k).
    const coverLeg = {
      id: "reb-food", accountId: "acc", postedAt: "2026-09-10T10:00:00.000Z", amount: 800_000,
      currency: "VND", direction: "debit", type: "transfer", merchantName: "Điều chỉnh hũ",
      merchantNormalizedName: "dieu chinh hu", categoryId: "dieu-chinh-hu", status: "posted",
      source: "self_reported", isRecurring: false, userEdited: false,
      rebalance: { fromJarId: "pool", toJarId: "food", triggerTxnId: "trig", origin: "auto" },
    } satisfies Transaction;
    const run = (lines: ReturnType<typeof makeJarBudgetLine>[]) =>
      jarPressure(
        makeFinancials({ monthKey: THIS_MONTH, jarBudget: makeJarBudgetResult({ lines }), jarRebalances: [coverLeg] }),
      );

    it("hũ vượt kế hoạch nhưng đã được bù đủ tiền → nhường cho jarOverspendCovered, không bắn", () => {
      expect(run([covered])).toBeNull();
    });

    it("hũ còn thiếu tiền vẫn bắn urgent, dù pct thấp hơn hũ đã bù", () => {
      const insight = run([covered, short]);
      expect(insight?.id).toBe(`jarPressure:${THIS_MONTH}:transport`);
      expect(insight?.severity).toBe("urgent");
      assertGrounded(insight!);
    });

    it("fact số dư không bao giờ âm: hũ còn thiếu tiền báo 'Cần bù' dương, không phải 'Còn lại' âm", () => {
      const insight = run([short]);
      // `factValues` normalises with Math.abs, so assert on the raw facts instead.
      const facts = insight!.sourceFacts;
      expect(facts.every((f) => typeof f.value !== "number" || f.value >= 0)).toBe(true);
      const labels = facts.map((f) => f.label);
      expect(labels).toContain("Cần bù");
      expect(labels).not.toContain("Còn lại");
      expect(facts.find((f) => f.label === "Cần bù")?.value).toBe(100_000);
    });

    it("hũ còn tiền báo 'Số dư' (trục số dư), không phải 'Còn lại' mơ hồ", () => {
      const nearLine = makeJarBudgetLine({
        huId: "fun", label: "Hưởng thụ", spent: 900_000, limit: 1_000_000,
        limitState: "set", status: "near", pct: 0.9, balance: 100_000, thresholdHit: true,
      });
      const insight = run([nearLine]);
      expect(insight!.sourceFacts.find((f) => f.label === "Số dư")?.value).toBe(100_000);
      expect(insight!.sourceFacts.map((f) => f.label)).not.toContain("Còn lại");
      expect(insight!.sourceFacts.map((f) => f.label)).not.toContain("Cần bù");
    });

    it("hũ đã bù không che mất một hũ 'sắp chạm' khác", () => {
      const nearLine = makeJarBudgetLine({
        huId: "fun", label: "Hưởng thụ", spent: 900_000, limit: 1_000_000,
        limitState: "set", status: "near", pct: 0.9, balance: 100_000, thresholdHit: true,
      });
      const insight = run([covered, nearLine]);
      expect(insight?.id).toBe(`jarPressure:${THIS_MONTH}:fun`);
      expect(insight?.severity).toBe("attention");
    });
  });

  describe("trục số dư tách khỏi trục hạn mức (plan 260923, Phase 05)", () => {
    const run = (lines: ReturnType<typeof makeJarBudgetLine>[], extra: Parameters<typeof makeFinancials>[0] = {}) =>
      jarPressure(makeFinancials({ monthKey: THIS_MONTH, jarBudget: makeJarBudgetResult({ lines }), ...extra }));

    it("Case B: vượt hạn mức nhưng hũ vẫn còn số dư (nạp nhiều hơn hạn mức) → attention, fact 'Số dư' dương", () => {
      const insight = run([
        makeJarBudgetLine({
          huId: "food", label: "Ăn uống", spent: 6_000_000, limit: 5_000_000,
          limitState: "set", status: "over", pct: 1.2, balance: 1_000_000, thresholdHit: true,
        }),
      ]);
      expect(insight?.title).toBe('Vượt hạn mức hũ "Ăn uống"');
      expect(insight?.severity).toBe("attention");
      expect(insight!.sourceFacts.find((f) => f.label === "Số dư")?.value).toBe(1_000_000);
      expect(insight!.sourceFacts.map((f) => f.label)).not.toContain("Cần bù");
      expect(insight!.explanation).toContain("Số dư hũ còn");
      assertGrounded(insight!);
    });

    it("hũ hết số dư xếp trước hũ chỉ vượt hạn mức, dù pct thấp hơn", () => {
      const insight = run([
        makeJarBudgetLine({ huId: "a", label: "A", spent: 3_000_000, limit: 1_000_000, limitState: "set", status: "over", pct: 3, balance: 500_000 }),
        makeJarBudgetLine({ huId: "b", label: "B", spent: 1_100_000, limit: 1_000_000, limitState: "set", status: "over", pct: 1.1, balance: -100_000 }),
      ]);
      expect(insight?.id).toBe(`jarPressure:${THIS_MONTH}:b`);
      expect(insight?.severity).toBe("urgent");
      expect(insight!.explanation).toContain("hết số dư");
    });

    it("số dư chưa biết (null) → không có fact số dư, không bao giờ hiện 0 (invariant #6)", () => {
      const insight = run([
        makeJarBudgetLine({ huId: "food", spent: 900_000, limit: 1_000_000, limitState: "set", status: "near", pct: 0.9, balance: null }),
      ]);
      const labels = insight!.sourceFacts.map((f) => f.label);
      expect(labels).not.toContain("Số dư");
      expect(labels).not.toContain("Cần bù");
      expect(labels).not.toContain("Còn lại");
      expect(insight?.severity).toBe("attention");
    });

    it("fact số dư mang provenance từ dòng số dư (envelope) — invariant #5", () => {
      const insight = run(
        [makeJarBudgetLine({ huId: "food", spent: 1_100_000, limit: 1_000_000, limitState: "set", status: "over", pct: 1.1, balance: -100_000 })],
        {
          jarEnvelope: {
            ...makeFinancials().jarEnvelope,
            jars: [{ jarId: "food", label: "Ăn uống", limit: 1_000_000, spent: 1_100_000, balance: -100_000, overLimit: true, inUse: true, source: "self_reported", freshness: null }],
          },
        },
      );
      expect(insight!.sourceFacts.find((f) => f.label === "Cần bù")?.source).toBe("self_reported");
    });
  });
});
