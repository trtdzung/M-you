import { describe, expect, it } from "vitest";
import {
  isValidAssetRecord,
  isValidLiabilityRecord,
  MAX_VND,
  validateAssetInput,
  validateLiabilityInput,
  type AssetDraft,
  type LiabilityDraft,
} from "../asset-liability-input";

const assetDraft = (over: Partial<AssetDraft> = {}): AssetDraft => ({
  name: "Tiền gửi",
  type: "deposit",
  value: "50000000",
  note: "",
  ...over,
});

const liabilityDraft = (over: Partial<LiabilityDraft> = {}): LiabilityDraft => ({
  name: "Thẻ tín dụng",
  type: "credit_card",
  balance: "5000000",
  rate: "30",
  minimumPayment: "500000",
  dueDate: "",
  remainingTerm: "",
  ...over,
});

describe("validateAssetInput (sole gate)", () => {
  it("accepts a valid asset and normalizes the value", () => {
    const r = validateAssetInput(assetDraft({ value: "1.000.000" }));
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ name: "Tiền gửi", type: "deposit", value: 1_000_000 });
  });

  it("treats a blank value as a genuinely-unknown valuation (null, not 0)", () => {
    const r = validateAssetInput(assetDraft({ value: "" }));
    expect(r.ok).toBe(true);
    expect(r.value?.value).toBeNull();
  });

  it("rejects blank name, negative, non-numeric, and over-cap values", () => {
    expect(validateAssetInput(assetDraft({ name: "  " })).errors.name).toBeTruthy();
    expect(validateAssetInput(assetDraft({ value: "-5" })).errors.value).toBeTruthy();
    expect(validateAssetInput(assetDraft({ value: "abc" })).errors.value).toBeTruthy();
    expect(validateAssetInput(assetDraft({ value: String(MAX_VND + 1) })).errors.value).toBeTruthy();
  });

  it("rejects an unknown asset type", () => {
    expect(validateAssetInput(assetDraft({ type: "crypto" as never })).errors.type).toBeTruthy();
  });
});

describe("validateLiabilityInput (sole gate)", () => {
  it("accepts a valid liability and converts the percent rate to a fraction", () => {
    const r = validateLiabilityInput(liabilityDraft({ rate: "14.5" }));
    expect(r.ok).toBe(true);
    expect(r.value?.interestRate).toBeCloseTo(0.145, 5);
    expect(r.value?.outstandingPrincipal).toBe(5_000_000);
  });

  it("rejects a rate over 100% and an invalid due date", () => {
    expect(validateLiabilityInput(liabilityDraft({ rate: "150" })).errors.rate).toBeTruthy();
    expect(validateLiabilityInput(liabilityDraft({ dueDate: "not-a-date" })).errors.dueDate).toBeTruthy();
  });

  it("enum-checks the liability type", () => {
    expect(validateLiabilityInput(liabilityDraft({ type: "payday" as never })).errors.type).toBeTruthy();
  });
});

describe("per-record storage guards", () => {
  it("accepts a well-formed record and rejects malformed / NaN / out-of-range", () => {
    const asset = { id: "a", type: "cash", name: "x", value: 1, currency: "VND", source: "self_reported", lastUpdatedAt: "t", isEstimated: true };
    expect(isValidAssetRecord(asset)).toBe(true);
    expect(isValidAssetRecord({ ...asset, value: Number.NaN })).toBe(false);
    expect(isValidAssetRecord({ ...asset, value: -1 })).toBe(false);
    expect(isValidAssetRecord({ id: "a" })).toBe(false);
    expect(isValidAssetRecord({ ...asset, value: null })).toBe(true); // unknown allowed

    const liab = { id: "l", type: "mortgage", name: "y", outstandingPrincipal: 10, interestRate: 0.1, minimumPayment: 1, dueDate: null, remainingTerm: 12, source: "self_reported", lastUpdatedAt: "t" };
    expect(isValidLiabilityRecord(liab)).toBe(true);
    expect(isValidLiabilityRecord({ ...liab, interestRate: 2 })).toBe(false); // rate must be a fraction ≤ 1
    expect(isValidLiabilityRecord({ ...liab, type: "payday" })).toBe(false);
  });
});
