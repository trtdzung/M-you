import { describe, expect, it } from "vitest";
import { amountInWords } from "../amount-in-words";

describe("amountInWords", () => {
  it.each([
    [0, "Không đồng"],
    [15, "Mười lăm đồng"],
    [21, "Hai mươi mốt đồng"],
    [100_000, "Một trăm nghìn đồng"],
    [1_200_000, "Một triệu hai trăm nghìn đồng"],
    [120_000_000, "Một trăm hai mươi triệu đồng"],
    [1_000_005, "Một triệu không trăm lẻ năm đồng"],
    [1_001_000_000, "Một tỷ không trăm lẻ một triệu đồng"],
  ])("reads %s as %s", (value, expected) => expect(amountInWords(value)).toBe(expected));
  it("rejects unsafe or negative amounts", () => {
    expect(amountInWords(Number.MAX_SAFE_INTEGER + 1)).toBe("");
    expect(amountInWords(-1)).toBe("");
  });
});
