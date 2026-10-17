import { describe, expect, it } from "vitest";
import { createLocalClassify, heuristicMatch } from "../local-classifier";
import { CATEGORIZE_CONFIDENCE_THRESHOLD } from "../config";
import type { ClassifyInput } from "../types";

/** Every bundled preset is assignable for this persona. */
const ASSIGNABLE = new Set(["transport", "dining", "groceries", "shopping", "subscriptions"]);
const localClassify = createLocalClassify(ASSIGNABLE);

describe("heuristicMatch", () => {
  it("maps known merchant keywords to categories", () => {
    expect(heuristicMatch("grab")).toBe("transport");
    expect(heuristicMatch("grabfood dong da")).toBe("dining"); // grabfood wins over grab (order)
    expect(heuristicMatch("winmart q1")).toBe("groceries");
    expect(heuristicMatch("shopee")).toBe("shopping");
    expect(heuristicMatch("netflix")).toBe("subscriptions");
  });

  it("returns undefined for an unknown merchant (never fabricates)", () => {
    expect(heuristicMatch("tiem la xyz")).toBeUndefined();
  });
});

describe("createLocalClassify", () => {
  const input = (merchant: string): ClassifyInput => ({
    txnId: merchant,
    merchant,
    amount: 1000,
    direction: "debit",
    type: "expense",
  });

  it("emits results only for recognised merchants", async () => {
    const out = await localClassify([input("grab"), input("unknown-merchant")]);
    expect(out.map((r) => r.txnId)).toEqual(["grab"]);
    expect(out[0].categoryId).toBe("transport");
  });

  it("uses a confidence BELOW the auto-apply threshold (heuristic ⇒ pending)", async () => {
    const out = await localClassify([input("shopee")]);
    expect(out[0].confidence).toBeLessThan(CATEGORIZE_CONFIDENCE_THRESHOLD);
  });
});
