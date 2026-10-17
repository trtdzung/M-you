import { describe, expect, it } from "vitest";
import { LOGIN_PASSWORD, validateLogin } from "./auth";

const CUSTOMERS = [
  { cif: "CIF_0001", label: "Ly Lã — Lương ổn định" },
  { cif: "CIF_0002", label: "Toàn Trần — Thu nhập biến động" },
];

describe("validateLogin", () => {
  it("accepts a known CIF with the correct password", () => {
    const result = validateLogin("CIF_0001", LOGIN_PASSWORD, CUSTOMERS);
    expect(result).toEqual({ ok: true, customer: CUSTOMERS[0] });
  });

  it("rejects when no customer is selected", () => {
    const result = validateLogin("", LOGIN_PASSWORD, CUSTOMERS);
    expect(result).toEqual({ ok: false, error: "Vui lòng chọn khách hàng" });
  });

  it("rejects a wrong password", () => {
    const result = validateLogin("CIF_0001", "wrong", CUSTOMERS);
    expect(result).toEqual({ ok: false, error: "Sai mật khẩu, vui lòng thử lại" });
  });
});
