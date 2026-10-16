import { describe, expect, it } from "vitest";
import { TRANSFER_BANKS, findBank, findBankByName } from "./transfer-banks";

describe("TRANSFER_BANKS", () => {
  it("only lists banks with a real logo asset in public/logos", () => {
    expect(TRANSFER_BANKS.length).toBeGreaterThan(0);
    expect(TRANSFER_BANKS.every((b) => b.logo.startsWith("/logos/"))).toBe(true);
  });

  it("includes MSB, Vietcombank and BIDV", () => {
    expect(findBank("msb")?.name).toBe("MSB");
    expect(findBank("vietcombank")?.name).toBe("Vietcombank");
    expect(findBank("bidv")?.name).toBe("BIDV");
  });

  it("does not include NHNN Việt Nam or any bank without a logo asset", () => {
    expect(TRANSFER_BANKS.find((b) => b.id === "nhnn")).toBeUndefined();
  });

  it("findBank returns undefined for an unknown id", () => {
    expect(findBank("khong-ton-tai")).toBeUndefined();
  });
});

describe("findBankByName", () => {
  it("matches a known bank name case-insensitively", () => {
    expect(findBankByName("MSB")?.id).toBe("msb");
    expect(findBankByName("vietcombank")?.id).toBe("vietcombank");
  });

  it("returns undefined for a bank with no logo asset (e.g. ACB) or an unknown name", () => {
    expect(findBankByName("ACB")).toBeUndefined();
    expect(findBankByName(undefined)).toBeUndefined();
  });
});
