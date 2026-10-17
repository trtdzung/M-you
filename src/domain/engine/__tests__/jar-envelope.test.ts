import { describe, it, expect } from "vitest";
import type { Account, JarConfig } from "@/domain/models";
import { monthPeriod } from "../types";
import { evaluateJarEnvelope, jarEnvelopeLines, casaPool } from "../jar-envelope";
import { computeUnallocatedPool } from "../unallocated-pool";

const PERIOD = monthPeriod(2026, 8); // 09/2026
const IN = "2026-09-10T00:00:00.000Z";

function account(id: string, availableBalance: number, over: Partial<Account> = {}): Account {
  return {
    id,
    type: "current",
    institution: "MSB",
    currency: "VND",
    balance: availableBalance,
    availableBalance,
    lastSyncedAt: IN,
    source: "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
    ...over,
  };
}

/** Config helper: jars carry their single number `budgetLimit` (undefined = chưa đặt). */
function config(jars: { id: string; label: string; budgetLimit?: number }[]): JarConfig {
  return { version: 3, jars: jars.map((j) => ({ ...j, categoryIds: [] })) };
}

const CONFIG = config([
  { id: "food", label: "Ăn uống" },
  { id: "bills", label: "Hóa đơn" },
  { id: "khac", label: "Khác" },
]);

const NO_SPEND = new Map<string, number>();
const CURRENT = [account("cur", 5_000_000)];

describe("casaPool", () => {
  it("no current account → unknown", () => {
    expect(casaPool([]).amount).toBe("unknown");
  });

  it("sums availableBalance across current accounts; savings/credit ignored", () => {
    const accounts = [account("cur1", 2_000_000), account("cur2", 3_000_000), account("sav", 9_000_000, { type: "savings" })];
    expect(casaPool(accounts).amount).toBe(5_000_000);
  });
});

describe("evaluateJarEnvelope — CASA pool (chờ phân bổ)", () => {
  it("no current account → pool and pending genuinely unknown (never 0)", () => {
    const res = evaluateJarEnvelope(CONFIG, [], NO_SPEND, PERIOD);
    expect(res.pending.pool).toBe("unknown");
    expect(res.pending.amount).toBe("unknown");
  });

  it("pool = Σ availableBalance of current accounts; savings/credit are ignored", () => {
    const accounts = [account("cur", 5_000_000), account("sav", 10_000_000, { type: "savings" })];
    const res = evaluateJarEnvelope(CONFIG, accounts, NO_SPEND, PERIOD);
    expect(res.pending.pool).toBe(5_000_000);
    expect(res.pending.amount).toBe(5_000_000);
  });

  it("sums pool across multiple current accounts", () => {
    const accounts = [account("cur1", 2_000_000), account("cur2", 3_000_000)];
    const res = evaluateJarEnvelope(CONFIG, accounts, NO_SPEND, PERIOD);
    expect(res.pending.pool).toBe(5_000_000);
  });

  it("pending = pool − Σ budgetLimit", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const res = evaluateJarEnvelope(cfg, CURRENT, NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe(3_000_000);
    expect(res.pending.allocated).toBe(2_000_000);
  });

  it("jars claiming more than CASA → pending keeps the TRUE negative + overAllocated (no clamp)", () => {
    // Never floored at 0: the cap is already breached, and the UI hides a ≤ 0 card
    // rather than inviting the user to split money `fitsCasaCap` would reject.
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 4_000_000 },
      { id: "bills", label: "Hóa đơn", budgetLimit: 4_000_000 },
    ]);
    const res = evaluateJarEnvelope(cfg, CURRENT, NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe(-3_000_000);
    expect(res.pending.overAllocated).toBe(true);
  });
});

describe("evaluateJarEnvelope — pending is the allocation headroom (limit lens, D27)", () => {
  it("spend does NOT enlarge the headroom — CASA 10tr, limit 5tr, spent 1tr → still 5tr", () => {
    // The spendable lens (picker pool) would say 6tr here; the sheet would only
    // accept 5tr, so the card must say 5tr too.
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 5_000_000 }]);
    const res = evaluateJarEnvelope(cfg, [account("cur", 10_000_000)], new Map([["food", 1_000_000]]), PERIOD);
    expect(res.pending.amount).toBe(5_000_000);
    expect(res.pending.allocated).toBe(5_000_000);
    expect(res.pending.amount).not.toBe(
      computeUnallocatedPool({ casaBalance: 10_000_000, spendableTotal: 4_000_000 }).amount,
    );
  });

  it("pending === pool − allocated, so it always matches the sheet's 'Còn lại để chia'", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 3_000_000 }]);
    const res = evaluateJarEnvelope(cfg, [account("cur", 8_000_000)], new Map([["food", 500_000]]), PERIOD);
    expect(res.pending.amount).toBe((res.pending.pool as number) - res.pending.allocated);
    expect(res.pending.amount).toBe(5_000_000);
  });

  it("an overspent jar still claims its full hạn mức; unset jars claim nothing", () => {
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 1_000_000 },
      { id: "bills", label: "Hóa đơn" },
    ]);
    const res = evaluateJarEnvelope(cfg, CURRENT, new Map([["food", 1_500_000]]), PERIOD);
    expect(res.pending.amount).toBe(4_000_000); // 5tr − 1tr hạn mức (bills unset → 0)
    expect(res.pending.overAllocated).toBe(false);
  });

  it("D27: no CASA account → pending 'unknown' and not overAllocated (never a fabricated negative)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 500_000 }]);
    const res = evaluateJarEnvelope(cfg, [], NO_SPEND, PERIOD);
    expect(res.pending.amount).toBe("unknown");
    expect(res.pending.overAllocated).toBe(false);
  });

  it("a corrupt budgetLimit (NaN) is unset — never NaN in pending", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: NaN }]);
    const res = evaluateJarEnvelope(cfg, CURRENT, NO_SPEND, PERIOD);
    expect(res.jars[0].budgetLimit).toBeNull();
    expect(res.pending.amount).toBe(5_000_000);
  });
});

describe("evaluateJarEnvelope — per-jar còn lại trong hũ (một con số)", () => {
  it("budgetLimit set → remaining = budgetLimit − spent, counts toward pending.allocated, source self_reported", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const spent = new Map([["food", 800_000]]);
    const res = evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD);
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.budgetLimit).toBe(2_000_000);
    expect(food.spent).toBe(800_000);
    expect(food.remaining).toBe(1_200_000);
    expect(food.inUse).toBe(true);
    expect(food.source).toBe("self_reported");
    expect(res.pending.allocated).toBe(2_000_000);
  });

  it("no budgetLimit → budgetLimit/remaining null, inUse false, source mock (never a fabricated 0)", () => {
    const res = evaluateJarEnvelope(CONFIG, CURRENT, NO_SPEND, PERIOD);
    const bills = res.jars.find((j) => j.jarId === "bills")!;
    expect(bills.budgetLimit).toBeNull();
    expect(bills.remaining).toBeNull();
    expect(bills.inUse).toBe(false);
    expect(bills.source).toBe("mock");
  });

  it("remaining may be negative when spent exceeds budgetLimit (overspent, never coerced)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 1_000_000 }]);
    const spent = new Map([["food", 1_500_000]]);
    const res = evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD);
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.remaining).toBe(-500_000);
  });

  it("overLimit is true only when a budgetLimit is set and spent exceeds it", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 1_000_000 }]);
    const over = evaluateJarEnvelope(cfg, CURRENT, new Map([["food", 1_500_000]]), PERIOD);
    expect(over.jars[0].overLimit).toBe(true);
    const under = evaluateJarEnvelope(cfg, CURRENT, new Map([["food", 500_000]]), PERIOD);
    expect(under.jars[0].overLimit).toBe(false);
  });

  it("overLimit is false when the jar has no budgetLimit even with spend", () => {
    const res = evaluateJarEnvelope(CONFIG, CURRENT, new Map([["food", 1_500_000]]), PERIOD);
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.budgetLimit).toBeNull();
    expect(food.overLimit).toBe(false);
  });

  it("mirrors the real case: pool 18tr, limits summing 17tr → pending 1tr", () => {
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 5_000_000 },
      { id: "bills", label: "Hóa đơn", budgetLimit: 7_000_000 },
      { id: "khac", label: "Khác", budgetLimit: 5_000_000 },
    ]);
    const res = evaluateJarEnvelope(cfg, [account("cur", 18_000_000)], NO_SPEND, PERIOD);
    expect(res.pending.allocated).toBe(17_000_000);
    expect(res.pending.pool).toBe(18_000_000);
    expect(res.pending.amount).toBe(1_000_000);
  });

  it("regression: the card can no longer promise headroom the sheet rejects", () => {
    // Bug as reported: card said "Chờ phân bổ 13,09 tr" while the sheet it opens
    // said "Còn lại để chia 199,9K" — the ~12,89tr gap was Σ đã chi kỳ này, which
    // the old spendable lens handed back as if it were allocatable.
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 4_000_000 },
      { id: "bills", label: "Hóa đơn", budgetLimit: 8_000_000 },
      { id: "khac", label: "Khác", budgetLimit: 5_000_000 },
    ]);
    const spent = new Map([["food", 3_500_000], ["bills", 6_000_000], ["khac", 3_390_000]]);
    const res = evaluateJarEnvelope(cfg, [account("cur", 17_199_900)], spent, PERIOD);
    expect(res.pending.allocated).toBe(17_000_000);
    expect(res.pending.amount).toBe(199_900); // what the sheet will accept
    // The spendable lens would have shown 12,89tr more — the whole of Σ đã chi.
    const spendableTotal = res.jars.reduce((s, l) => s + Math.max(0, l.remaining ?? 0), 0);
    expect(17_199_900 - spendableTotal).toBe(199_900 + 12_890_000);
  });

  it("is deterministic (same inputs → same output)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const a = evaluateJarEnvelope(cfg, CURRENT, NO_SPEND, PERIOD);
    const b = evaluateJarEnvelope(cfg, CURRENT, NO_SPEND, PERIOD);
    expect(a).toEqual(b);
  });
});

describe("evaluateJarEnvelope — rebalance fold (Phase 03): a covered jar is no longer `overLimit`", () => {
  it("remaining folds the net rebalance; overLimit is recomputed off the POST-rebalance remaining", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 4_000_000 }]);
    const spent = new Map([["food", 4_500_000]]); // 500k over budget
    const withoutCoverage = evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD);
    expect(withoutCoverage.jars[0].remaining).toBe(-500_000);
    expect(withoutCoverage.jars[0].overLimit).toBe(true);

    const net = new Map([["food", 500_000]]); // a donor covered the overspend
    const withCoverage = evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD, net);
    expect(withCoverage.jars[0].remaining).toBe(0); // (4M − 4.5M) + 0.5M
    expect(withCoverage.jars[0].overLimit).toBe(false); // covered — no longer "vượt"
  });

  it("a jar that DONATED (negative net) shows a lowered remaining and may flip to overLimit", () => {
    const cfg = config([{ id: "bills", label: "Hóa đơn", budgetLimit: 1_000_000 }]);
    const spent = new Map([["bills", 800_000]]); // within budget on its own
    const net = new Map([["bills", -400_000]]); // donated 400k to another jar
    const res = evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD, net);
    expect(res.jars[0].remaining).toBe(1_000_000 - 800_000 - 400_000); // -200k
    expect(res.jars[0].overLimit).toBe(true); // donating pushed it over
  });

  it("no rebalanceNetByJar argument leaves remaining/overLimit exactly as the pre-Phase-03 computation", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const spent = new Map([["food", 500_000]]);
    expect(evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD)).toEqual(
      evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD, new Map()),
    );
  });
});

describe("jarEnvelopeLines", () => {
  it("reads budgetLimit directly from config per jar", () => {
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 3_000_000 },
      { id: "bills", label: "Hóa đơn" },
    ]);
    const lines = jarEnvelopeLines(cfg, new Map([["food", 1_000_000]]));
    expect(lines.find((l) => l.jarId === "food")!.remaining).toBe(2_000_000);
    expect(lines.find((l) => l.jarId === "bills")!.remaining).toBeNull();
  });
});
