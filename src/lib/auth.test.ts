import { describe, expect, it } from "vitest";
import { validateLogin } from "./auth";

const CUSTOMERS = [
  { cif: "CIF_0001", label: "Ly Lã — Lương ổn định" },
  { cif: "CIF_0002", label: "Toàn Trần — Thu nhập biến động" },
];

describe("validateLogin", () => {
  it("accepts a known CIF", () => {
    const result = validateLogin("CIF_0001", CUSTOMERS);
    expect(result).toEqual({ ok: true, customer: CUSTOMERS[0] });
  });

  it("rejects when no customer is selected", () => {
    const result = validateLogin("", CUSTOMERS);
    expect(result).toEqual({ ok: false, error: "Vui lòng chọn khách hàng" });
  });

  it("rejects an unknown CIF", () => {
    const result = validateLogin("CIF_UNKNOWN", CUSTOMERS);
    expect(result).toEqual({ ok: false, error: "Vui lòng chọn khách hàng" });
  });
});
