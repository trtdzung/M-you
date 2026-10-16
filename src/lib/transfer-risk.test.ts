import { describe, expect, it } from "vitest";
import { assessTransferRisk, hitsThreshold, TRANSFER_THRESHOLD_VND } from "./transfer-risk";

describe("transfer risk", () => {
  it("includes the threshold boundary", () => {
    expect(hitsThreshold(TRANSFER_THRESHOLD_VND)).toBe(true);
    expect(hitsThreshold(TRANSFER_THRESHOLD_VND - 1)).toBe(false);
  });

  it("reports deterministic form risks", () => {
    expect(assessTransferRisk({ amount: TRANSFER_THRESHOLD_VND, isNewPayee: true })).toEqual(["over_threshold", "new_payee"]);
  });
});
