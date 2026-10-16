import { describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import { evaluateJarBudget } from "../jar-budget";
import { jarSpendable } from "../jar-spendable";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

describe("jarSpendable (derived: max(0, remaining), null stays null)", () => {
  it("null remaining (no limit) → null (non-fundable, never 0)", () => {
    expect(jarSpendable(null)).toBeNull();
  });
  it("negative remaining (over budget) → 0 (never negative)", () => {
    expect(jarSpendable(-1)).toBe(0);
    expect(jarSpendable(-500_000)).toBe(0);
  });
  it("zero remaining → 0", () => {
    expect(jarSpendable(0)).toBe(0);
  });
  it("positive remaining → passthrough", () => {
    expect(jarSpendable(1_210_000)).toBe(1_210_000);
  });
});

const JUNE = monthPeriod(2026, 5);
const MAY = monthPeriod(2026, 4);
const NOW = new Date("2026-06-20T00:00:00.000Z"); // 11 days left in June

/** food (limit 4M) + transport (limit 1M) + savings (no categories, UNSET limit). */
const config: JarConfig = {
  version: 3,
  jars: [
    { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"], budgetLimit: 4_000_000 },
    { id: "transport", label: "Di chuyển", categoryIds: ["transport"], budgetLimit: 1_000_000 },
    { id: "savings", label: "Tiết kiệm", categoryIds: [] }, // budgetLimit undefined
  ],
};

const byId = (r: ReturnType<typeof evaluateJarBudget>) =>
  Object.fromEntries(r.lines.map((l) => [l.huId, l]));

describe("evaluateJarBudget — spend folds across a jar's categories", () => {
  it("sums net expense over every category in the jar", () => {
    const r = evaluateJarBudget(
      config,
      [
        txn({ categoryId: "dining", amount: 1_000_000 }),
        txn({ categoryId: "groceries", amount: 500_000 }),
        txn({ categoryId: "transport", amount: 900_000 }),
      ],
      JUNE,
      MAY,
      NOW,
    );
    const j = byId(r);
    expect(j.food.spent).toBe(1_500_000);
    expect(j.transport.spent).toBe(900_000);
  });
});

describe("evaluateJarBudget — limit classification (set jars)", () => {
  const r = evaluateJarBudget(
    config,
    [
      txn({ categoryId: "dining", amount: 1_500_000 }), // food 1.5M/4M -> 37.5% ok
      txn({ categoryId: "transport", amount: 900_000 }), // 0.9M/1M -> 90% near
    ],
    JUNE,
    MAY,
    NOW,
  );
  const j = byId(r);

  it("classifies ok / near / over with a threshold flag at 80%", () => {
    expect(j.food.status).toBe("ok");
    expect(j.food.thresholdHit).toBe(false);
    expect(j.transport.status).toBe("near");
    expect(j.transport.thresholdHit).toBe(true);
    expect(j.transport.pct).toBeCloseTo(0.9);
  });

  it("reports remaining and pct for a set limit", () => {
    expect(j.food.remaining).toBe(2_500_000);
    expect(j.food.pct).toBeCloseTo(0.375);
    expect(j.food.limitState).toBe("set");
  });

  it("flags over-budget above 100%", () => {
    const over = evaluateJarBudget(
      config,
      [txn({ categoryId: "transport", amount: 1_200_000 })],
      JUNE,
      MAY,
      NOW,
    );
    expect(byId(over).transport.status).toBe("over");
    expect(byId(over).transport.remaining).toBe(-200_000);
  });
});

describe("evaluateJarBudget — unset limit stays unknown, NEVER 0 (invariant #6)", () => {
  const r = evaluateJarBudget(config, [], JUNE, MAY, NOW);
  const j = byId(r);

  it("an undefined budgetLimit yields limitState 'unset' with null fields", () => {
    expect(j.savings.limitState).toBe("unset");
    expect(j.savings.limit).toBeNull();
    expect(j.savings.remaining).toBeNull();
    expect(j.savings.pct).toBeNull();
    expect(j.savings.status).toBeNull();
    expect(j.savings.thresholdHit).toBe(false);
  });

  it("does NOT coerce the unset jar to 0% / 'ok'", () => {
    expect(j.savings.pct).not.toBe(0);
    expect(j.savings.status).not.toBe("ok");
  });
});

describe("evaluateJarBudget — insufficient data (set jar, no transactions)", () => {
  it("spent 0 with the full limit remaining is a valid 'ok', distinct from unset", () => {
    const j = byId(evaluateJarBudget(config, [], JUNE, MAY, NOW));
    expect(j.food.spent).toBe(0);
    expect(j.food.remaining).toBe(4_000_000);
    expect(j.food.pct).toBe(0);
    expect(j.food.status).toBe("ok");
    expect(j.food.limitState).toBe("set"); // limit IS set — 0 spend, not unknown
  });
});

describe("evaluateJarBudget — obeys the cashflow rules (DRY, no double-count)", () => {
  it("nets refunds, excludes reversed / pending / internal transfers", () => {
    const j = byId(
      evaluateJarBudget(
        config,
        [
          txn({ categoryId: "dining", type: "expense", amount: 1_500_000 }),
          txn({ categoryId: "dining", type: "refund", direction: "credit", amount: 500_000 }),
          txn({ categoryId: "groceries", type: "expense", amount: 999_000, status: "reversed" }),
          txn({ categoryId: "groceries", type: "expense", amount: 777_000, status: "pending" }),
          txn({ categoryId: "dining", type: "transfer", amount: 2_000_000 }),
        ],
        JUNE,
        MAY,
        NOW,
      ),
    );
    expect(j.food.spent).toBe(1_000_000); // 1.5M expense − 0.5M refund; others excluded
  });
});

describe("evaluateJarBudget — month-over-month (clock/period injected)", () => {
  it("computes momDelta and momPct against the previous period", () => {
    const j = byId(
      evaluateJarBudget(
        config,
        [
          txn({ categoryId: "dining", amount: 1_000_000, postedAt: "2026-06-10T10:00:00.000Z" }),
          txn({ categoryId: "dining", amount: 800_000, postedAt: "2026-05-10T10:00:00.000Z" }),
        ],
        JUNE,
        MAY,
        NOW,
      ),
    );
    expect(j.food.spent).toBe(1_000_000);
    expect(j.food.prevSpent).toBe(800_000);
    expect(j.food.momDelta).toBe(200_000);
    expect(j.food.momPct).toBeCloseTo(0.25);
  });

  it("momPct is null when the previous period had no spend (no divide-by-zero)", () => {
    const j = byId(
      evaluateJarBudget(config, [txn({ categoryId: "dining", amount: 1_000_000 })], JUNE, MAY, NOW),
    );
    expect(j.food.prevSpent).toBe(0);
    expect(j.food.momPct).toBeNull();
    expect(j.food.momDelta).toBe(1_000_000);
  });
});

describe("evaluateJarBudget — summary gauge counts only jars with a set limit", () => {
  it("totals limits/spend over set jars; lists unset separately", () => {
    const r = evaluateJarBudget(
      config,
      [
        txn({ categoryId: "dining", amount: 1_400_000 }), // food set
        txn({ categoryId: "transport", amount: 1_000_000 }), // transport set
      ],
      JUNE,
      MAY,
      NOW,
    );
    expect(r.summary.totalLimit).toBe(5_000_000); // food 4M + transport 1M
    expect(r.summary.totalSpentSet).toBe(2_400_000);
    expect(r.summary.totalRemaining).toBe(2_600_000);
    expect(r.summary.pctUsed).toBeCloseTo(0.48);
    expect(r.summary.setCount).toBe(2);
    expect(r.summary.unsetCount).toBe(1);
    expect(r.summary.daysLeft).toBe(11);
  });

  it("totalLimit is null when no jar has a set limit (unknown, not 0)", () => {
    const noLimits: JarConfig = {
      version: 3,
      jars: [{ id: "x", label: "X", categoryIds: ["dining"] }],
    };
    const r = evaluateJarBudget(noLimits, [txn({ categoryId: "dining", amount: 1 })], JUNE, MAY, NOW);
    expect(r.summary.totalLimit).toBeNull();
    expect(r.summary.pctUsed).toBeNull();
    expect(r.summary.totalRemaining).toBeNull();
  });
});

describe("evaluateJarBudget — rebalance fold (Phase 03): remaining += Σnhận − Σcho, spent UNCHANGED", () => {
  it("a jar that received a covering rebalance shows a LIFTED remaining while `spent` stays the raw spend-vs-limit truth", () => {
    const net = new Map([["food", 1_000_000]]); // received 1tr from a donor
    const r = evaluateJarBudget(
      config,
      [txn({ categoryId: "dining", amount: 4_500_000 })], // over the 4M limit by 500k
      JUNE,
      MAY,
      NOW,
      net,
    );
    const j = byId(r);
    expect(j.food.spent).toBe(4_500_000); // the REAL spend — untouched by the rebalance
    expect(j.food.remaining).toBe(500_000); // (4M − 4.5M) + 1M nhận = 0.5M — no longer negative
    // D24/L13: the verdict is post-rebalance — effective limit 5M, 4.5M/5M = 90% → near,
    // NOT "over" (same verdict as the envelope's overLimit=false).
    expect(j.food.rebalanceNet).toBe(1_000_000);
    expect(j.food.effectiveLimit).toBe(5_000_000);
    expect(j.food.limit).toBe(4_000_000); // raw limit kept
    expect(j.food.status).toBe("near");
    expect(j.food.pct).toBeCloseTo(0.9, 10);
  });

  it("a jar that DONATED shows a lowered remaining, spend on its own category untouched", () => {
    const net = new Map([["transport", -300_000]]); // gave 300k away
    const r = evaluateJarBudget(config, [txn({ categoryId: "transport", amount: 200_000 })], JUNE, MAY, NOW, net);
    const j = byId(r);
    expect(j.transport.spent).toBe(200_000); // unaffected by the donation
    expect(j.transport.remaining).toBe(1_000_000 - 200_000 - 300_000); // 500k
  });

  it("a jar with NO limit stays `remaining: null` even if it appears in the rebalance net map (non-fundable, never a fabricated number)", () => {
    const net = new Map([["savings", 500_000]]);
    const j = byId(evaluateJarBudget(config, [], JUNE, MAY, NOW, net));
    expect(j.savings.remaining).toBeNull();
    expect(j.savings.limitState).toBe("unset");
  });

  it("no `rebalanceNetByJar` argument (undefined) preserves the pre-Phase-03 result (net treated as 0 everywhere)", () => {
    const withUndefined = evaluateJarBudget(config, [txn({ categoryId: "dining", amount: 1_000_000 })], JUNE, MAY, NOW);
    const withEmptyMap = evaluateJarBudget(config, [txn({ categoryId: "dining", amount: 1_000_000 })], JUNE, MAY, NOW, new Map());
    expect(withUndefined).toEqual(withEmptyMap);
  });

  it("totalRemaining folds every set jar's net (Σ of per-line remaining, not a re-derived Σlimit−Σspent)", () => {
    const net = new Map([
      ["food", 1_000_000], // food received
      ["transport", -1_000_000], // transport donated
    ]);
    const r = evaluateJarBudget(
      config,
      [txn({ categoryId: "dining", amount: 1_400_000 }), txn({ categoryId: "transport", amount: 1_000_000 })],
      JUNE,
      MAY,
      NOW,
      net,
    );
    // food: 4M − 1.4M + 1M = 3.6M; transport: 1M − 1M − 1M = −1M. Sum = 2.6M.
    expect(r.summary.totalRemaining).toBe(2_600_000);
    // The net rebalance is zero-sum across the two jars (one gave what the other
    // received) — the total gauge moves by exactly 0 vs the no-rebalance baseline
    // ONLY when donor/receiver are both `set` jars (conservation, not a leak).
    const baseline = evaluateJarBudget(
      config,
      [txn({ categoryId: "dining", amount: 1_400_000 }), txn({ categoryId: "transport", amount: 1_000_000 })],
      JUNE,
      MAY,
      NOW,
    );
    expect(r.summary.totalRemaining).toBe(baseline.summary.totalRemaining); // 1M given == 1M received
  });
});

describe("evaluateJarBudget — provenance per line (invariant #5)", () => {
  it("carries the lowest-trust source and the freshest contributing date", () => {
    const j = byId(
      evaluateJarBudget(
        config,
        [
          txn({ categoryId: "dining", source: "msb", postedAt: "2026-06-05T10:00:00.000Z" }),
          txn({ categoryId: "groceries", source: "mock", postedAt: "2026-06-18T10:00:00.000Z" }),
        ],
        JUNE,
        MAY,
        NOW,
      ),
    );
    expect(j.food.source).toBe("mock"); // mock is lower-trust than msb
    expect(j.food.freshness).toBe("2026-06-18T10:00:00.000Z");
  });

  it("defaults an empty jar's source to mock with null freshness", () => {
    const j = byId(evaluateJarBudget(config, [], JUNE, MAY, NOW));
    expect(j.savings.source).toBe("mock");
    expect(j.savings.freshness).toBeNull();
  });
});
