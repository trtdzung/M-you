import { describe, expect, it } from "vitest";
import { buildScanPrompt, classifyScanInput } from "../scan-input";

describe("classifyScanInput", () => {
  it.each([
    ["https://msb-hoantien.com/nhan-qua", "link"],
    ["www.msb.com.vn", "link"],
    ["msb-hoantien.com", "link"],
    ["bit.ly/3abcXYZ", "link"],
    ["0912345678", "phone"],
    ["090 000 0001", "phone"],
    ["+84 912 345 678", "phone"],
    ["1900 1234", "phone"],
    ["9999888877776666", "account"],
    ["0123456789012", "account"],
    ["Chuc mung quy khach duoc hoan tien, nhan ngay tai msb-hoantien.com", "message"],
    ["Cuc thue yeu cau cung cap OTP", "message"],
  ])("%s → %s", (text, kind) => {
    expect(classifyScanInput(text)).toBe(kind);
  });
});

describe("buildScanPrompt", () => {
  it("starts with the type-specific sentence and carries the trimmed content", () => {
    expect(buildScanPrompt("  https://x.vn  ")).toBe("Kiểm tra bảo mật cho link sau: https://x.vn");
    expect(buildScanPrompt("0912345678")).toBe("Kiểm tra bảo mật cho số điện thoại sau: 0912345678");
    expect(buildScanPrompt("9999888877776666")).toBe("Kiểm tra bảo mật cho tài khoản sau: 9999888877776666");
    expect(buildScanPrompt("Anh ơi chuyển tiền gấp")).toBe("Kiểm tra bảo mật cho tin nhắn sau: Anh ơi chuyển tiền gấp");
  });
});
