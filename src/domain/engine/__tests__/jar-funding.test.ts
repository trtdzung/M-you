import { describe, it, expect } from "vitest";
import type { JarRole } from "@/domain/models";
import { evaluateFunding, POOL_DONOR_ID } from "../jar-funding";
import type { JarSpendable } from "../jar-spendable";

/** A jar reduced to its derived spendable (`null` = no limit / non-fundable). */
function jar(
  id: string,
  spendable: number | null,
  categoryIds: string[] = [],
  role?: JarRole,
): JarSpendable {
  return { id, label: id, categoryIds, spendable, role };
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

  it("topup: role waterfall — `essential` is the LAST resort, tapped only after `spending`", () => {
    // CASA=12tr; src=1tr (spending), disc=2tr (spending), rent=9tr (essential) → claimed=12, pool=0.
    // need 10tr from src(1tr) → shortfall 9tr. Same-tier `disc`(spending) drains
    // FIRST; `rent`(essential) is the last-resort tier → tapped only for the residual.
    const jars = [
      jar("src", 1_000_000, ["dining"], "spending"),
      jar("disc", 2_000_000, ["entertainment"], "spending"),
      jar("rent", 9_000_000, ["housing"], "essential"),
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

  it("a category-less jar with a balance inflates claimed but can't donate → insufficient, not a short topup (Warning 2)", () => {
    // CASA=12tr; src=1tr, blank=6tr (spendable but NO categories → non-donatable),
    // disc=5tr → claimed=12, pool=0. need 10tr from src(1tr): the ONLY reachable
    // money is src(1) + pool(0) + disc(5) = 6tr < 10tr. `blank`'s 6tr is claimed
    // away from the pool yet can never be donated, so the transfer is a hard block —
    // NOT a `topup` whose chain silently covers only 5tr of the 9tr shortfall.
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("blank", 6_000_000, []),
      jar("disc", 5_000_000, ["entertainment"]),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 12_000_000, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.shortfall).toBe(4_000_000); // 10tr − coverable 6tr
    expect(a.donors).toEqual([]);
  });

  it("same non-donatable balance present, but the amount is within reach → topup with a chain that sums to the FULL shortfall", () => {
    // CASA=12tr; src=1tr, blank=6tr (non-donatable), disc=5tr → claimed=12, pool=0.
    // need 6tr from src(1tr) → shortfall 5tr. coverable = 1 + 0 + 5 = 6tr ≥ 6tr → topup,
    // and `disc` alone (5tr) covers the whole shortfall exactly (blank never tapped).
    const jars = [
      jar("src", 1_000_000, ["dining"]),
      jar("blank", 6_000_000, []),
      jar("disc", 5_000_000, ["entertainment"]),
    ];
    const a = evaluateFunding({ amount: 6_000_000, sourceJarId: "src", casaBalance: 12_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(5_000_000);
    expect(a.donors).toEqual([{ jarId: "disc", label: "Hũ disc", take: 5_000_000 }]);
    expect(a.donors.reduce((s, d) => s + d.take, 0)).toBe(a.shortfall); // chain fully covers
    expect(a.donors.some((d) => d.jarId === "blank")).toBe(false);
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

  it("insufficient from pool source when a non-donatable jar's balance blocks reach (Warning 2, symmetric)", () => {
    // CASA=10tr; blank=7tr (spendable, NO categories → non-donatable), disc=1tr →
    // claimed=8tr, pool=2tr. need 6tr from the pool: reachable = pool(2) + disc(1) = 3tr < 6tr.
    // `blank`'s 7tr is claimed away yet can't be donated → hard block, not a short topup.
    const jars = [jar("blank", 7_000_000, []), jar("disc", 1_000_000, ["entertainment"])];
    const a = evaluateFunding({ amount: 6_000_000, sourceJarId: null, casaBalance: 10_000_000, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.shortfall).toBe(3_000_000); // 6tr − coverable 3tr
    expect(a.donors).toEqual([]);
  });
});

describe("evaluateFunding — role waterfall (pool → buffer → spending → essential; goal protected)", () => {
  it("drains the full role order: buffer before spending before essential", () => {
    // CASA=21tr; src=1tr(spending), buf=4tr(buffer), spend=3tr(spending), ess=6tr(essential)
    // → claimed=14tr, pool=7tr. need 15tr from src(1tr) → shortfall 14tr.
    // Order: pool(7) → buf(4) → spend(3) → ess(6→take 0, already covered at 14).
    const jars = [
      jar("src", 1_000_000, ["dining"], "spending"),
      jar("buf", 4_000_000, ["savings"], "buffer"),
      jar("spend", 3_000_000, ["entertainment"], "spending"),
      jar("ess", 6_000_000, ["housing"], "essential"),
    ];
    const a = evaluateFunding({ amount: 15_000_000, sourceJarId: "src", casaBalance: 21_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.shortfall).toBe(14_000_000);
    expect(a.donors).toEqual([
      { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 7_000_000 },
      { jarId: "buf", label: "Hũ buf", take: 4_000_000 },
      { jarId: "spend", label: "Hũ spend", take: 3_000_000 },
    ]);
    expect(a.donors.some((d) => d.jarId === "ess")).toBe(false);
  });

  it("a `goal` jar is NEVER in the auto `donors` chain even when it is the largest balance", () => {
    // CASA=16tr; src=1tr(spending), goal=10tr(goal), spend=2tr(spending) → claimed=13, pool=3tr.
    // need 6tr from src(1) → shortfall 5tr. pool(3) then spend(2) covers exactly 5tr;
    // `goal`'s 10tr is never touched even though it dwarfs every other donor.
    const jars = [
      jar("src", 1_000_000, ["dining"], "spending"),
      jar("goal", 10_000_000, ["goal-save"], "goal"),
      jar("spend", 2_000_000, ["entertainment"], "spending"),
    ];
    const a = evaluateFunding({ amount: 6_000_000, sourceJarId: "src", casaBalance: 16_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([
      { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 3_000_000 },
      { jarId: "spend", label: "Hũ spend", take: 2_000_000 },
    ]);
    expect(a.donors.some((d) => d.jarId === "goal")).toBe(false);
    expect(a.requiresManualGoal).toBe(false);
  });

  it("a missing `role` defaults to `spending` (back-compat, never crashes)", () => {
    const jars = [jar("src", 1_000_000, ["dining"]), jar("noRole", 5_000_000, ["shopping"])];
    const a = evaluateFunding({ amount: 4_000_000, sourceJarId: "src", casaBalance: 6_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.donors).toEqual([{ jarId: "noRole", label: "Hũ noRole", take: 3_000_000 }]);
  });
});

describe("evaluateFunding — C2 dual ceiling (goal-excl classifies tier; goal-incl gates requiresManualGoal)", () => {
  it("a shortfall coverable ONLY by a `goal` jar → tier is NOT `topup`; requiresManualGoal true; goalDonors covers the gap", () => {
    // CASA=13tr; src=1tr(spending), spend=2tr(spending), goal=8tr(goal) → claimed=11, pool=2tr.
    // need 10tr from src(1) → shortfall 9tr. ceilingExclGoal = src(1)+pool(2)+spend(2) = 5tr
    // < amount(10tr) → NOT topup. ceilingInclGoal = src(1)+pool(2)+spend(2)+goal(8) = 13tr ≥
    // amount → requiresManualGoal. The non-goal chain (pool+spend = 4tr) under-covers the
    // 9tr shortfall by itself; `goalDonors` closes exactly the 5tr residual gap.
    const jars = [
      jar("src", 1_000_000, ["dining"], "spending"),
      jar("spend", 2_000_000, ["entertainment"], "spending"),
      jar("goal", 8_000_000, ["goal-save"], "goal"),
    ];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 13_000_000, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.requiresManualGoal).toBe(true);
    // Non-goal donors chain covers only what THEY can (never over-reports full coverage).
    expect(a.donors).toEqual([
      { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 2_000_000 },
      { jarId: "spend", label: "Hũ spend", take: 2_000_000 },
    ]);
    expect(a.donors.reduce((s, d) => s + d.take, 0)).toBe(4_000_000); // < shortfall (9tr) — under-covers on its own
    // The goal chain closes exactly the residual gap (shortfall − non-goal coverage).
    expect(a.goalDonors).toEqual([{ jarId: "goal", label: "Hũ goal", take: 5_000_000 }]);
    expect(a.donors.reduce((s, d) => s + d.take, 0) + a.goalDonors.reduce((s, d) => s + d.take, 0)).toBe(
      a.shortfall,
    );
  });

  it("a shortfall coverable by non-goal jars alone → plain `topup`, requiresManualGoal false, even with a goal jar present", () => {
    // CASA=13tr; src=1tr(spending), spend=5tr(spending), goal=7tr(goal) → claimed=13, pool=0.
    // need 4tr from src(1) → shortfall 3tr. Non-goal ceiling = spend(5) ≥ 3tr → topup,
    // fully via `spend` — `goal` is never touched, requiresManualGoal stays false.
    const jars = [
      jar("src", 1_000_000, ["dining"], "spending"),
      jar("spend", 5_000_000, ["entertainment"], "spending"),
      jar("goal", 7_000_000, ["goal-save"], "goal"),
    ];
    const a = evaluateFunding({ amount: 4_000_000, sourceJarId: "src", casaBalance: 13_000_000, jars });
    expect(a.tier).toBe("topup");
    expect(a.requiresManualGoal).toBe(false);
    expect(a.donors).toEqual([{ jarId: "spend", label: "Hũ spend", take: 3_000_000 }]);
    expect(a.donors.reduce((s, d) => s + d.take, 0)).toBe(a.shortfall);
    expect(a.goalDonors).toEqual([]);
  });

  it("even the goal-inclusive ceiling can't cover → hard `insufficient`, requiresManualGoal false (C1 residual, no false promise)", () => {
    // CASA=6tr; src=1tr(spending), goal=2tr(goal) → claimed=3tr, pool=3tr.
    // need 10tr from src(1) → shortfall 9tr. ceilingInclGoal = min(CASA=6, 1+3+0+2)=6tr < 9tr
    // → even every donatable jar (incl. goal) falls short. Never a false `requiresManualGoal`.
    const jars = [jar("src", 1_000_000, ["dining"], "spending"), jar("goal", 2_000_000, ["goal-save"], "goal")];
    const a = evaluateFunding({ amount: 10_000_000, sourceJarId: "src", casaBalance: 6_000_000, jars });
    expect(a.tier).toBe("insufficient");
    expect(a.requiresManualGoal).toBe(false);
    expect(a.donors).toEqual([]);
    expect(a.goalDonors).toEqual([]);
    expect(a.shortfall).toBe(4_000_000); // 10tr − ceilingInclGoal(6tr)
  });
});
