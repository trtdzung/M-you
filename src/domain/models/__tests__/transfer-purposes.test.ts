import { describe, expect, it } from "vitest";
import {
  TRANSFER_PURPOSES,
  isTransferPurpose,
  isSpendingPurpose,
  purposeCategoryId,
  transferPurposeLabel,
} from "../transfer-purposes";
import { CATEGORY_BY_ID } from "../categories";

/**
 * The purpose taxonomy is data validated on every use (invariant #7). These lock
 * the Hybrid rule: a `spending` purpose MUST map to a real expense category (so
 * accepting it can flip the txn to expense), and a non-spending one must NOT.
 */
describe("transfer-purposes taxonomy", () => {
  it("validates known vs unknown ids", () => {
    expect(isTransferPurpose("debt")).toBe(true);
    expect(isTransferPurpose("rent")).toBe(true);
    expect(isTransferPurpose("not-a-purpose")).toBe(false);
    expect(isTransferPurpose("")).toBe(false);
  });

  it("every spending purpose maps to a real, non-transfer expense category", () => {
    for (const p of TRANSFER_PURPOSES) {
      if (!p.spending) {
        expect(p.mapsToCategoryId).toBeUndefined();
        expect(purposeCategoryId(p.id)).toBeUndefined();
        continue;
      }
      const catId = purposeCategoryId(p.id);
      expect(catId).toBeTruthy();
      const cat = catId ? CATEGORY_BY_ID[catId] : undefined;
      expect(cat).toBeDefined();
      expect(cat?.kind).toBe("expense");
    }
  });

  it("isSpendingPurpose reflects the flag", () => {
    expect(isSpendingPurpose("rent")).toBe(true);
    expect(isSpendingPurpose("bill_split")).toBe(true);
    expect(isSpendingPurpose("debt")).toBe(false);
    expect(isSpendingPurpose("unknown")).toBe(false);
  });

  it("labels resolve, unknown ids fall back to the raw id", () => {
    expect(transferPurposeLabel("debt")).toBe("Trả nợ / cho vay");
    expect(transferPurposeLabel("zzz")).toBe("zzz");
  });
});
