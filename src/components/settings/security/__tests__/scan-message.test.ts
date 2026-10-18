import { describe, expect, it } from "vitest";
import { normalizeText, scanMessage } from "../scan-message";

describe("normalizeText", () => {
  it("lowercases and strips Vietnamese diacritics and replaces đ/Đ with d", () => {
    expect(normalizeText("CÔNG AN ĐIỀU TRA")).toBe("cong an dieu tra");
    expect(normalizeText("Mã OTP bảo mật")).toBe("ma otp bao mat");
    expect(normalizeText("Đăng nhập tài khoản")).toBe("dang nhap tai khoan");
  });
});

describe("scanMessage", () => {
  it("returns clear for harmless message mentioning official MSB domain", () => {
    const res = scanMessage("Truy cap trang chu https://msb.com.vn de xem thong tin san pham");
    expect(res.level).toBe("clear");
    expect(res.reasons).toEqual([]);
  });

  it("marks as danger when message asks for OTP or passwords", () => {
    const res = scanMessage("Vui long cung cap ma OTP de xac thuc giao dich");
    expect(res.level).toBe("danger");
    expect(res.reasons.some((r) => r.includes("OTP"))).toBe(true);
  });

  it("marks as danger when message contains a watched fraud number even with spacing", () => {
    const res = scanMessage("Chuyen khoan vao so 090 000 0001 de nhan thuong");
    expect(res.level).toBe("danger");
    expect(res.reasons.some((r) => r.includes("danh sách cảnh báo"))).toBe(true);
  });

  it("detects fake non-MSB domain links", () => {
    const res = scanMessage("Dang nhap tai https://msb-bank-security.xyz de kiem tra");
    expect(res.reasons.some((r) => r.includes("msb-bank-security.xyz"))).toBe(true);
  });

  it("flags fake promotions impersonating MSB", () => {
    const res = scanMessage("Chuc mung ban da trung thuong 10 trieu tu MSB");
    expect(res.reasons.some((r) => r.includes("không có chương trình này"))).toBe(true);
  });

  it("flags messages claiming to be government or tax authorities", () => {
    const res = scanMessage("Cong an thanh pho yeu cau nop tien xu phat");
    expect(res.reasons.some((r) => r.includes("cơ quan nhà nước"))).toBe(true);
  });

  it("marks as suspicious when exactly 1 mild flag is found", () => {
    const res = scanMessage("Yeu cau xu ly gap trong 15 phut");
    expect(res.level).toBe("suspicious");
    expect(res.reasons).toHaveLength(1);
  });

  it("marks as danger when 2 or more flags combine", () => {
    const res = scanMessage("Yeu cau xu ly gap: Cong an thong bao nop tien phat");
    // Urgent + Authority -> 2 reasons
    expect(res.level).toBe("danger");
    expect(res.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
