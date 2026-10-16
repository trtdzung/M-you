import { describe, expect, it } from "vitest";
import { heuristicPurpose, localPurposeClassify } from "../local-purpose-classifier";
import { isTransferPurpose } from "@/domain/models";
import type { ClassifyInput } from "@/ai/categorize/types";

/**
 * The local purpose heuristic must (a) only ever emit VALID purpose ids, (b) stay
 * pending-worthy (low confidence < the auto-apply gate), and (c) return NOTHING
 * for an unknown transfer — never fabricate a purpose (invariant #6 safety).
 */
describe("heuristicPurpose", () => {
  it("matches memo keywords to the right purpose", () => {
    expect(heuristicPurpose("Nguyen Van A", "tra no thang 9")).toBe("debt");
    expect(heuristicPurpose("Chu nha", "tien nha")).toBe("rent");
    expect(heuristicPurpose("Quy TK", "tiet kiem")).toBe("savings");
    expect(heuristicPurpose("Nhom ban", "chia tien an")).toBe("bill_split");
  });

  it("also reads the recipient name when there is no memo", () => {
    expect(heuristicPurpose("Cong ty ABC")).toBe("business");
  });

  it("returns undefined for an unknown transfer (no fabrication)", () => {
    expect(heuristicPurpose("Nguyen Van A")).toBeUndefined();
    expect(heuristicPurpose("Tran Thi B", "chuyen tien")).toBeUndefined();
  });

  it("only ever yields ids that exist in the purpose taxonomy", () => {
    const samples = ["tra no", "tien nha", "tiet kiem", "chia tien", "kinh doanh", "li xi", "qua tang"];
    for (const memo of samples) {
      const id = heuristicPurpose("x", memo);
      expect(id && isTransferPurpose(id)).toBe(true);
    }
  });
});

describe("localPurposeClassify", () => {
  const input = (over: Partial<ClassifyInput>): ClassifyInput => ({
    txnId: "t1",
    merchant: "Nguyen Van A",
    amount: 500_000,
    direction: "debit",
    type: "transfer",
    ...over,
  });

  it("emits a low-confidence (pending) row for a matched transfer", async () => {
    const out = await localPurposeClassify([input({ note: "tra no" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ txnId: "t1", categoryId: "debt" });
    expect(out[0].confidence).toBeLessThan(0.8); // below the auto-apply gate → pending
  });

  it("skips transfers with no keyword match (no result row)", async () => {
    const out = await localPurposeClassify([input({ note: "chuyen tien" })]);
    expect(out).toEqual([]);
  });
});
