import { describe, it, expect } from "vitest";
import type { Jar } from "@/domain/models";
import { evaluateFunding, isJarFixed, POOL_DONOR_ID } from "../jar-funding";

function jar(id: string, actualAmount: number | undefined, categoryIds: string[] = []): Jar {
  return { id, label: id, categoryIds, ...(actualAmount !== undefined ? { actualAmount } : {}) };
}

describe("isJarFixed", () => {
  it("true only when EVERY category is fixed", () => {
    expect(isJarFixed({ categoryIds: ["housing", "utilities"] })).toBe(true);
    expect(isJarFixed({ categoryIds: ["insurance"] })).toBe(true);
  });
  it("mixed jar is discretionary (tappable)", () => {
    expect(isJarFixed({ categoryIds: ["housing", "dining"] })).toBe(false);
  });
  it("all-discretionary is not fixed", () => {
    expect(isJarFixed({ categoryIds: ["dining", "entertainment"] })).toBe(false);
  });
  it("empty jar is not protected", () => {
    expect(isJarFixed({ categoryIds: [] })).toBe(false);
  });
});

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

  it("topup: fixed jars are the LAST resort (tapped only after discretionary)", () => {
    // CASA=12tr; src=1tr, disc=2tr, fixedJar=9tr → claimed=12, pool=0.
    // need 10tr from src(1tr) → shortfall 9tr. disc(2tr) then fixedJar(9tr→take 7tr).
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("disc", 2_000_000, ["entertainment"]),
      jar("rent", 9_000_000, ["housing"]),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 12_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([
      { jarId: "disc", label: "Hũ disc", take: 2_000_000 },
      { jarId: "rent", label: "Hũ rent", take: 7_000_000 },
    ]);
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

  it("source jar with no actualAmount contributes 0, pool covers", () => {
    const jars = [jar("src", undefined, ["dining"]), jar("other", 4_000_000, ["shopping"])];
    // CASA=10tr, claimed=4tr, pool=6tr. need 5tr from src(0) → shortfall 5tr → pool 5tr.
    const a = evaluateFunding({ amount: 5_000_000, sourceJarId: "src", casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([{ jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 5_000_000 }]);
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
});
