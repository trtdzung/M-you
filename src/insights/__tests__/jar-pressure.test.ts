import { describe, expect, it } from "vitest";
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
              remaining: -800_000,
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
              remaining: 100_000,
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
                remaining: null,
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
                remaining: 3_000_000,
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
      remaining: 0, thresholdHit: true,
    });
    const short = makeJarBudgetLine({
      huId: "transport", label: "Đi lại", spent: 2_100_000, limit: 2_000_000,
      limitState: "set", status: "over", pct: 1.05, remaining: -100_000, thresholdHit: true,
    });
    const run = (lines: ReturnType<typeof makeJarBudgetLine>[]) =>
      jarPressure(makeFinancials({ monthKey: THIS_MONTH, jarBudget: makeJarBudgetResult({ lines }) }));

    it("hũ vượt kế hoạch nhưng đã được bù đủ tiền → nhường cho jarOverspendCovered, không bắn", () => {
      expect(run([covered])).toBeNull();
    });

    it("hũ còn thiếu tiền vẫn bắn urgent, dù pct thấp hơn hũ đã bù", () => {
      const insight = run([covered, short]);
      expect(insight?.id).toBe(`jarPressure:${THIS_MONTH}:transport`);
      expect(insight?.severity).toBe("urgent");
      assertGrounded(insight!);
    });

    it("hũ đã bù không che mất một hũ 'sắp chạm' khác", () => {
      const nearLine = makeJarBudgetLine({
        huId: "fun", label: "Hưởng thụ", spent: 900_000, limit: 1_000_000,
        limitState: "set", status: "near", pct: 0.9, remaining: 100_000, thresholdHit: true,
      });
      const insight = run([covered, nearLine]);
      expect(insight?.id).toBe(`jarPressure:${THIS_MONTH}:fun`);
      expect(insight?.severity).toBe("attention");
    });
  });
});
