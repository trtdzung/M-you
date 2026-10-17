/**
 * Edge-case guards for the jar budget engine (plan 260919-1915): B07 double-count,
 * N11b corrupt limits, the two-axis split (a transfer moves SỐ DƯ, never the hạn
 * mức verdict), U22 summary arithmetic. Deterministic fixtures only.
 */
import { describe, expect, it } from "vitest";
import type { JarConfig, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { withSeedDeposits } from "@/test-utils/jar-ledger-fixtures";
import { balanceAsOf, jarBalances } from "../jar-balance";
import { evaluateJarBudget } from "../jar-budget";
import { evaluateJarEnvelope } from "../jar-envelope";
import { rebalanceNetByJar } from "../jar-rebalance";
import { jarNeedsManualTopUp } from "../jar-spendable";
import { monthPeriod, type Period } from "../types";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5);
const MAY = monthPeriod(2026, 4);
const NOW = new Date("2026-06-20T00:00:00.000Z");

/** Running balances of a MIGRATED config (opening deposit = limit at the period start). */
const balancesOf = (cfg: JarConfig, txns: Transaction[], period: Period, now: Date) =>
  jarBalances(withSeedDeposits(cfg, period.from), txns, balanceAsOf(period, now), period.to);

/** `evaluateJarBudget` wired like `computeFinancials` (legs, if any, are already in `txns`). */
function budgetOf(cfg: JarConfig, txns: Transaction[], period: Period, prev: Period, now: Date, net?: Map<string, number>) {
  return evaluateJarBudget(cfg, txns, period, prev, now, net, balancesOf(cfg, txns, period, now));
}

const byId = (r: ReturnType<typeof evaluateJarBudget>) => Object.fromEntries(r.lines.map((l) => [l.huId, l]));

function leg(fromJarId: string, toJarId: string, amount: number) {
  return txn({
    type: "transfer",
    categoryId: REBALANCE_CATEGORY,
    amount,
    rebalance: { fromJarId, toJarId, triggerTxnId: "trigger", origin: "auto" },
  });
}

describe("B07 — a category claimed by two jars counts only in its first owner", () => {
  const dup: JarConfig = {
    version: 3,
    jars: [
      { id: "a", label: "A", categoryIds: ["dining"], budgetLimit: 1_000_000 },
      { id: "b", label: "B", categoryIds: ["dining", "transport"], budgetLimit: 1_000_000 },
    ],
  };

  it("spend is counted once (first-wins), never twice", () => {
    const r = budgetOf(dup, [txn({ categoryId: "dining", amount: 100_000 }), txn({ categoryId: "transport", amount: 40_000 })], JUNE, MAY, NOW);
    const j = byId(r);
    expect(j.a.spent).toBe(100_000);
    expect(j.b.spent).toBe(40_000); // only transport — dining belongs to "a"
    expect(r.summary.totalSpent).toBe(140_000); // = real spend
  });

  it("a category listed twice inside ONE jar is also counted once", () => {
    const cfg: JarConfig = { version: 3, jars: [{ id: "a", label: "A", categoryIds: ["dining", "dining"], budgetLimit: 500_000 }] };
    expect(byId(budgetOf(cfg, [txn({ categoryId: "dining", amount: 100_000 })], JUNE, MAY, NOW)).a.spent).toBe(100_000);
  });
});

describe("N11b — a corrupt budgetLimit is treated as unset (never NaN)", () => {
  it.each([NaN, Infinity, -Infinity, -1])("budgetLimit=%s → unset, balance/pct/status null", (budgetLimit) => {
    const cfg: JarConfig = { version: 3, jars: [{ id: "a", label: "A", categoryIds: ["dining"], budgetLimit }] };
    const r = budgetOf(cfg, [txn({ categoryId: "dining", amount: 100_000 })], JUNE, MAY, NOW);
    const a = r.lines[0];
    expect(a.limitState).toBe("unset");
    expect(a.limit).toBeNull();
    expect(a.balance).toBeNull();
    expect(a.pct).toBeNull();
    expect(a.status).toBeNull();
    expect(r.summary.totalLimit).toBeNull();
    expect(r.summary.totalBalance).toBeNull();
  });

  it("a non-finite rebalance net is ignored (never leaks into rebalanceNet or balance)", () => {
    const cfg: JarConfig = { version: 3, jars: [{ id: "a", label: "A", categoryIds: ["dining"], budgetLimit: 500_000 }] };
    const r = budgetOf(cfg, [], JUNE, MAY, NOW, new Map([["a", NaN]]));
    expect(r.lines[0].rebalanceNet).toBe(0);
    expect(r.lines[0].balance).toBe(500_000);
  });
});

describe("hai trục — một lần chuyển hũ đổi SỐ DƯ, không đổi verdict hạn mức", () => {
  const cfg: JarConfig = {
    version: 3,
    jars: [
      { id: "a", label: "A", categoryIds: ["shopping"], budgetLimit: 500_000 },
      { id: "b", label: "B", categoryIds: ["dining"], budgetLimit: 100_000 },
    ],
  };

  function both(legs: ReturnType<typeof leg>[], bSpend = 150_000) {
    const txns = [txn({ categoryId: "dining", amount: bSpend }), ...legs];
    const net = rebalanceNetByJar(txns, JUNE);
    const budget = budgetOf(cfg, txns, JUNE, MAY, NOW, net);
    const spentByJar = new Map(budget.lines.map((l) => [l.huId, l.spent]));
    const env = evaluateJarEnvelope(cfg, [], spentByJar, JUNE, balancesOf(cfg, txns, JUNE, NOW));
    return { b: byId(budget).b, envB: env.jars.find((j) => j.jarId === "b")! };
  }

  it("bù vừa đủ về số dư 0: hạn mức và verdict KHÔNG đổi, spent vẫn raw", () => {
    const { b, envB } = both([leg("a", "b", 50_000)]);
    expect(b.spent).toBe(150_000);
    expect(b.balance).toBe(0); // số dư đã được bù
    expect(b.limit).toBe(100_000); // hạn mức không bị nâng
    expect(b.status).toBe("over"); // vẫn vượt KẾ HOẠCH (150k > 100k)
    expect(b.pct).toBe(1.5);
    expect(envB.overLimit).toBe(true);
    expect(jarNeedsManualTopUp(b.balance)).toBe(false); // nhưng không còn thiếu tiền
  });

  it("bù một phần: cả hai trục đều xấu", () => {
    const { b, envB } = both([leg("a", "b", 20_000)]);
    expect(b.balance).toBe(-30_000);
    expect(b.status).toBe("over");
    expect(envB.overLimit).toBe(true);
    expect(jarNeedsManualTopUp(b.balance)).toBe(true);
  });

  it("hũ cho hết số dư mà không tiêu gì: hạn mức giữ nguyên, không bị coi là vượt", () => {
    const { b, envB } = both([leg("b", "a", 100_000)], 0);
    expect(b.limit).toBe(100_000); // KHÔNG còn bị hạ về 0
    expect(b.balance).toBe(0);
    expect(b.status).toBe("ok");
    expect(b.pct).toBe(0);
    expect(envB.overLimit).toBe(false); // cho tiền không phải là vượt kế hoạch
  });

  it("hai trục độc lập qua một dải kích thước leg", () => {
    for (const amount of [0, 10_000, 49_999, 50_000, 50_001, 200_000]) {
      const legs = amount > 0 ? [leg("a", "b", amount)] : [];
      const { b, envB } = both(legs);
      // Trục hạn mức: bất biến với mọi khoản bù (spent 150k > limit 100k).
      expect(b.status).toBe("over");
      expect(b.limit).toBe(100_000);
      expect(envB.overLimit).toBe(true);
      // Trục số dư: di chuyển theo đúng khoản bù.
      expect(b.balance).toBe(100_000 - 150_000 + amount);
      expect(jarNeedsManualTopUp(b.balance)).toBe((b.balance as number) < 0);
    }
  });

  it("kịch bản người dùng: chuyển 1tr từ Ăn uống sang Đi lại", () => {
    const cfg2: JarConfig = {
      version: 3,
      jars: [
        { id: "an-uong", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 5_000_000 },
        { id: "di-lai", label: "Đi lại", categoryIds: ["transport"], budgetLimit: 2_000_000 },
      ],
    };
    const txns = [
      txn({ categoryId: "transport", amount: 2_000_000 }),
      leg("an-uong", "di-lai", 1_000_000),
    ];
    const net = rebalanceNetByJar(txns, JUNE);
    const { lines } = budgetOf(cfg2, txns, JUNE, MAY, NOW, net);
    const an = lines.find((l) => l.huId === "an-uong")!;
    const di = lines.find((l) => l.huId === "di-lai")!;

    // Hạn mức GIỮ NGUYÊN, số dư di chuyển đúng 1tr.
    expect(an.limit).toBe(5_000_000);
    expect(an.balance).toBe(4_000_000);
    expect(di.limit).toBe(2_000_000);
    expect(di.balance).toBe(1_000_000);
    // Đi lại tiêu đúng hạn mức (2tr/2tr) → chưa vượt kế hoạch, dù đã nhận tiền.
    expect(di.status).toBe("near");
    expect(di.pct).toBe(1);
    expect(an.status).toBe("ok");
  });
});

describe("U22 — summary arithmetic adds up with rebalance legs out of the set jars", () => {
  it("migrated jar, first month: totalBalance = totalLimit − totalSpentSet + totalRebalanceNet (leg to the pool)", () => {
    const cfg: JarConfig = { version: 3, jars: [{ id: "a", label: "A", categoryIds: ["dining"], budgetLimit: 1_000_000 }] };
    const txns = [txn({ categoryId: "dining", amount: 1_200_000 }), leg("a", "pool", 300_000)];
    const r = budgetOf(cfg, txns, JUNE, MAY, NOW, rebalanceNetByJar(txns, JUNE));
    const s = r.summary;
    expect(s.totalRebalanceNet).toBe(-300_000);
    expect(s.totalBalance).toBe(-500_000);
    expect(s.totalBalance).toBe((s.totalLimit as number) - s.totalSpentSet + s.totalRebalanceNet);
  });

  it("totalRebalanceNet is 0 with no legs", () => {
    const cfg: JarConfig = { version: 3, jars: [{ id: "a", label: "A", categoryIds: ["dining"], budgetLimit: 1_000_000 }] };
    expect(budgetOf(cfg, [], JUNE, MAY, NOW).summary.totalRebalanceNet).toBe(0);
  });
});
