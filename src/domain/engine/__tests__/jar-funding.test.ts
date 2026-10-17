import { describe, it, expect } from "vitest";
import { evaluateFunding, POOL_DONOR_ID } from "../jar-funding";
import type { JarSpendable } from "../jar-spendable";

/** A jar reduced to its derived spendable (`null` = no limit / non-fundable). */
function jar(id: string, spendable: number | null, categoryIds: string[] = []): JarSpendable {
  return { id, label: id, categoryIds, spendable };
}

describe("evaluateFunding — jar source", () => {
  const CASA = 20_000_000;

  it("ok: source jar covers the amount → no donors", () => {
    const jars = [jar("food", 10_000_000, ["dining"])];
    const a = evaluateFunding({ amount: 8_000_000, sourceJarId: "food", casaBalance: CASA, jars });
    expect(a.tier).toBe("ok");
    expect(a.shortfall).toBe(0);
    expect(a.donors).toEqual([]);
    expect(a.targetJarId).toBe("food");
  });

  it("topup: one discretionary donor covers shortfall (RT — pool empty)", () => {
    // essential=8tr, need 10tr → shortfall 2tr; ent has 5tr; pool = 20 - (8+5) = 7tr → pool covers first!
    const jars = [jar("essential", 8_000_000, ["housing"]), jar("ent", 5_000_000, ["entertainment"])];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "essential", casaBalance: CASA, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(2_000_000);
    // pool (20 - 13 = 7tr) is priority #1 → single pool donor of 2tr.
    expect(a.donors).toEqual([{ jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 2_000_000 }]);
  });

  it("topup: pool priority then discretionary jar when pool is short", () => {
    // CASA=15tr; essential=8tr, ent=5tr, groc=2tr → claimed=15tr, pool=0.
    // need 10tr from essential → shortfall 2tr; pool 0 → tap ent (largest disc, 5tr) for 2tr.
    const jars = [
      jar("essential", 8_000_000, ["housing"]),
      jar("ent", 5_000_000, ["entertainment"]),
      jar("groc", 2_000_000, ["groceries"]),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "essential", casaBalance: 15_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(2_000_000);
    expect(a.donors).toEqual([{ jarId: "ent", label: "Hũ ent", take: 2_000_000 }]);
  });

  it("topup: multi-donor chain, largest discretionary first, stops when covered", () => {
    // CASA=16tr; src=2tr, big=6tr, small=3tr, tiny=5tr → claimed=16, pool=0.
    // need 12tr from src(2tr) → shortfall 10tr. donors: big(6tr) then tiny(5tr→take 4tr) = 10tr.
    const jars = [
      jar("src", 2_000_000, ["dining"]),
      jar("big", 6_000_000, ["shopping"]),
      jar("small", 3_000_000, ["transport"]),
      jar("tiny", 5_000_000, ["health"]),
    ];
    const a = evaluateFunding({ amount: 12_000_000, sourceJarId: "src", casaBalance: 16_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(10_000_000);
    expect(a.donors).toEqual([
      { jarId: "big", label: "Hũ big", take: 6_000_000 },
      { jarId: "tiny", label: "Hũ tiny", take: 4_000_000 },
    ]);
  });

  it("topup: no role tiers — a large essential jar is tapped before a small one", () => {
    // CASA=12tr; src=1tr, disc=2tr, rent=9tr → claimed=12, pool=0.
    // need 10tr from src(1tr) → shortfall 9tr. Largest balance first: rent covers all 9tr.
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("disc", 2_000_000, ["entertainment"]),
      jar("rent", 9_000_000, ["housing"]),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 12_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([{ jarId: "rent", label: "Hũ rent", take: 9_000_000 }]);
  });

  it("topup: only a fixed jar left → it is still used (covers or nothing else does)", () => {
    // CASA=10tr; src=2tr, rent=8tr → claimed=10, pool=0. need 6tr → shortfall 4tr from rent.
    const jars = [jar("src", 2_000_000, ["dining"]), jar("rent", 8_000_000, ["housing"])];
    const a = evaluateFunding({ amount: 6_000_000, sourceJarId: "src", casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([{ jarId: "rent", label: "Hũ rent", take: 4_000_000 }]);
  });

  it("insufficient: amount exceeds whole CASA → hard block, no donors", () => {
    const jars = [jar("src", 2_000_000, ["dining"])];
    const a = evaluateFunding({ amount: 25_000_000, sourceJarId: "src", casaBalance: CASA, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.shortfall).toBe(5_000_000);
    expect(a.donors).toEqual([]);
  });

  it("source jar with no limit (spendable null) contributes 0, pool covers", () => {
    const jars = [jar("src", null, ["dining"]), jar("other", 4_000_000, ["shopping"])];
    // CASA=10tr, claimed=4tr, pool=6tr. need 5tr from src(0) → shortfall 5tr → pool 5tr.
    const a = evaluateFunding({ amount: 5_000_000, sourceJarId: "src", casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([{ jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 5_000_000 }]);
  });

  it("a null-spendable jar (no limit) is excluded as a DONOR", () => {
    // CASA=12tr; src=1tr, noLimit=? (null), disc=6tr → claimed = 1+0+6 = 7tr, pool=5tr.
    // need 10tr from src(1tr) → shortfall 9tr. pool 5tr, then disc 4tr; noLimit never tapped.
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("savings", null, ["health"]),
      jar("disc", 6_000_000, ["entertainment"]),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 12_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([
      { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 5_000_000 },
      { jarId: "disc", label: "Hũ disc", take: 4_000_000 },
    ]);
    expect(a.donors.some((d) => d.jarId === "savings")).toBe(false);
  });

  it("S6/E11: a category-less jar with a balance DONATES (donor gate = spendable != null)", () => {
    // CASA=12tr; src=1tr, blank=6tr (spendable, NO categories), disc=5tr → claimed=12,
    // pool=0. need 10tr from src(1tr) → shortfall 9tr. A donor is charged by a
    // rebalance leg (no category needed), so `blank` is a real donor: largest
    // first → blank 6tr, then disc 3tr.
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("blank", 6_000_000, []),
      jar("disc", 5_000_000, ["entertainment"]),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 12_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(9_000_000);
    expect(a.donors).toEqual([
      { jarId: "blank", label: "Hũ blank", take: 6_000_000 },
      { jarId: "disc", label: "Hũ disc", take: 3_000_000 },
    ]);
    expect(a.donors.reduce((s, d) => s + d.take, 0)).toBe(a.shortfall); // chain fully covers
  });

});

describe("evaluateFunding — pool source (RT#8)", () => {
  it("ok: pool covers the no-jar transfer", () => {
    // CASA=10tr, claimed=4tr, pool=6tr. need 5tr from pool → ok.
    const jars = [jar("a", 4_000_000, ["dining"])];
    const a = evaluateFunding({ amount: 5_000_000, sourceJarId: null, casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("ok");
    expect(a.targetJarId).toBeNull();
    expect(a.donors).toEqual([]);
  });

  it("topup: pool short → jars pulled down to lift the pool, no pool donor, no target", () => {
    // CASA=10tr, claimed=8tr (ent 5tr + rent 3tr), pool=2tr. need 6tr from pool → shortfall 4tr.
    // donors exclude pool; disc(ent 5tr) first → take 4tr.
    const jars = [jar("ent", 5_000_000, ["entertainment"]), jar("rent", 3_000_000, ["housing"])];
    const a = evaluateFunding({ amount: 6_000_000, sourceJarId: null, casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(4_000_000);
    expect(a.targetJarId).toBeNull();
    expect(a.donors).toEqual([{ jarId: "ent", label: "Hũ ent", take: 4_000_000 }]);
    // pool is never its own donor in the pool direction.
    expect(a.donors.some((d) => d.jarId === POOL_DONOR_ID)).toBe(false);
  });

  it("insufficient from pool source: amount > CASA", () => {
    const jars = [jar("a", 4_000_000, ["dining"])];
    const a = evaluateFunding({ amount: 12_000_000, sourceJarId: null, casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("insufficient");
  });

  it("S6 (pool source): a category-less jar's balance lifts the pool like any donor", () => {
    // CASA=10tr; blank=7tr (spendable, NO categories), disc=1tr → claimed=8tr, pool=2tr.
    // need 6tr from the pool → shortfall 4tr → blank (largest spending) covers 4tr.
    const jars = [jar("blank", 7_000_000, []), jar("disc", 1_000_000, ["entertainment"])];
    const a = evaluateFunding({ amount: 6_000_000, sourceJarId: null, casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(4_000_000);
    expect(a.donors).toEqual([{ jarId: "blank", label: "Hũ blank", take: 4_000_000 }]);
  });
});

describe("evaluateFunding — donor order (pool → jars, largest balance first)", () => {
  it("pool first, then every jar by balance, stopping once covered", () => {
    // CASA=21tr; src=1tr, buf=4tr, spend=3tr, ess=6tr → claimed=14tr, pool=7tr.
    // need 15tr from src(1tr) → shortfall 14tr. Order: pool(7) → ess(6) → buf(1 of 4).
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("buf", 4_000_000, ["savings"]),
      jar("spend", 3_000_000, ["entertainment"]),
      jar("ess", 6_000_000, ["housing"]),
    ];
    const a = evaluateFunding({ amount: 15_000_000, sourceJarId: "src", casaBalance: 21_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(14_000_000);
    expect(a.donors).toEqual([
      { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 7_000_000 },
      { jarId: "ess", label: "Hũ ess", take: 6_000_000 },
      { jarId: "buf", label: "Hũ buf", take: 1_000_000 },
    ]);
  });

  it("no jar is protected: the largest jar donates even when it is a savings jar", () => {
    // CASA=13tr; src=1tr, spend=2tr, goal=8tr → claimed=11, pool=2tr.
    // need 10tr from src(1) → shortfall 9tr → pool(2) → goal(7 of 8). Plain topup.
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("spend", 2_000_000, ["entertainment"]),
      jar("goal", 8_000_000, ["goal-save"]),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 13_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([
      { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 2_000_000 },
      { jarId: "goal", label: "Hũ goal", take: 7_000_000 },
    ]);
    expect(a.donors.reduce((sum, d) => sum + d.take, 0)).toBe(a.shortfall);
  });

  it("every donatable jar together can't cover → insufficient with the uncovered gap", () => {
    // CASA=6tr; src=1tr, other=2tr → claimed=3tr, pool=3tr. need 10tr → ceiling 6tr.
    const jars = [jar("src", 1_000_000, ["dining"]), jar("other", 2_000_000, ["goal-save"])];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 6_000_000, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.donors).toEqual([]);
    expect(a.shortfall).toBe(4_000_000); // 10tr − ceiling(6tr)
  });
});

describe("evaluateFunding — non-finite / non-positive amount guards (E01)", () => {
  const jars = [jar("src", 100_000, ["dining"]), jar("other", 500_000, ["shopping"])];

  it.each([NaN, Infinity, -Infinity])("amount=%s → graceful insufficient, shortfall 0, no donors (no NaN/Infinity leak)", (amount) => {
    const a = evaluateFunding({ amount, sourceJarId: "src", casaBalance: 1_000_000, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.shortfall).toBe(0);
    expect(a.donors).toEqual([]);
    expect(a.targetJarId).toBe("src");
  });

  it("NaN amount from the pool source is also graceful", () => {
    const a = evaluateFunding({ amount: NaN, sourceJarId: null, casaBalance: 1_000_000, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.shortfall).toBe(0);
    expect(a.targetJarId).toBeNull();
  });

  it.each([0, -100])("amount=%s (≤ 0) → ok, nothing to fund", (amount) => {
    const a = evaluateFunding({ amount, sourceJarId: "src", casaBalance: 0, jars });
    expect(a.tier).toBe("ok");
    expect(a.shortfall).toBe(0);
    expect(a.donors).toEqual([]);
  });

  it("a non-finite donor spendable is treated as 0 (never a NaN take)", () => {
    const dirty = [jar("src", 0, ["dining"]), jar("bad", NaN, ["shopping"]), jar("ok", 300_000, ["health"])];
    const a = evaluateFunding({ amount: 200_000, sourceJarId: "src", casaBalance: 300_000, jars: dirty });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([{ jarId: "ok", label: "Hũ ok", take: 200_000 }]);
  });
});
