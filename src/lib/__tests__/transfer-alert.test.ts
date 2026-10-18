import { describe, expect, it } from "vitest";
import {
  accountLastFour,
  isTrustedRecipient,
  transferAlertLevel,
  type TransferAlertInput,
} from "../transfer-alert";

describe("accountLastFour", () => {
  it("extracts last 4 digits from standard and masked accounts", () => {
    expect(accountLastFour("0123456789")).toBe("6789");
    expect(accountLastFour("••• 1234")).toBe("1234");
    expect(accountLastFour("VCB-9876-0001")).toBe("0001");
  });

  it("returns null for accounts with fewer than 4 digits or undefined", () => {
    expect(accountLastFour(undefined)).toBeNull();
    expect(accountLastFour("")).toBeNull();
    expect(accountLastFour("123")).toBeNull();
    expect(accountLastFour("abc")).toBeNull();
  });
});

describe("isTrustedRecipient", () => {
  const trusted = [
    { name: "Nguyễn Văn An", account: "0987654321" },
    { name: "Trần Thị Bình", account: "••• 4567" },
  ];

  it("returns true when name and last 4 digits match regardless of case/accents", () => {
    expect(isTrustedRecipient(trusted, "Nguyễn Văn An", "0987654321")).toBe(true);
    expect(isTrustedRecipient(trusted, "nguyen van an", "1111114321")).toBe(true);
    expect(isTrustedRecipient(trusted, "TRẦN THỊ BÌNH", "••• 4567")).toBe(true);
  });

  it("returns false if name or account mismatch", () => {
    expect(isTrustedRecipient(trusted, "Nguyễn Văn An", "0987659999")).toBe(false);
    expect(isTrustedRecipient(trusted, "Lê Văn Cường", "0987654321")).toBe(false);
    expect(isTrustedRecipient([], "Nguyễn Văn An", "0987654321")).toBe(false);
  });
});

describe("transferAlertLevel", () => {
  const daytimeUtc = new Date("2026-10-14T05:00:00Z"); // 12:00 in UTC+7
  const midnightUtc = new Date("2026-10-14T17:00:00Z"); // 00:00 in UTC+7 (midnight)
  const trusted = [{ name: "Nguyễn Văn A", account: "00001234" }];

  const baseInput: TransferAlertInput = {
    amount: 1_000_000,
    isNewPayee: false,
    recipientName: "Lê Văn B",
    recipientAccount: "99998888",
    memo: "Chuyen tien an trua",
    postedAt: daytimeUtc,
    aiProtect: true,
    trusted,
  };

  it("returns green when aiProtect is disabled, ignoring all risk factors", () => {
    const alert = transferAlertLevel({
      ...baseInput,
      aiProtect: false,
      isNewPayee: true,
      amount: 50_000_000,
      postedAt: midnightUtc,
      memo: "Nop tien cong an dieu tra",
    });
    expect(alert).toEqual({ level: "green", reasons: [] });
  });

  it("returns green for trusted recipients even with high amount and midnight hour", () => {
    const alert = transferAlertLevel({
      ...baseInput,
      recipientName: "Nguyễn Văn A",
      recipientAccount: "11111234",
      amount: 100_000_000,
      postedAt: midnightUtc,
    });
    expect(alert).toEqual({ level: "green", reasons: [] });
  });

  it("flags RED immediately on name spoof (same name as trusted, different account)", () => {
    const alert = transferAlertLevel({
      ...baseInput,
      recipientName: "Nguyễn Văn A",
      recipientAccount: "99999999", // different from 1234
    });
    expect(alert.level).toBe("red");
    expect(alert.reasons).toContain("Tên giống người quen, khác số tài khoản");
  });

  it("flags RED on authority / scam keywords in memo", () => {
    const keywords = [
      { memo: "Nop tien thue ca nhan", word: "thuế" },
      { memo: "Chuyen khoan theo yeu cau cong an", word: "công an" },
      { memo: "An phi toa an nhan dan", word: "tòa án" },
      { memo: "Le phi hai quan", word: "hải quan" },
      { memo: "Xac nhan ma OTP", word: "OTP" },
      { memo: "Lenh phong toa tai khoan", word: "phong tỏa" },
      { memo: "Phuc vu cong tac dieu tra", word: "điều tra" },
    ];

    for (const { memo, word } of keywords) {
      const alert = transferAlertLevel({
        ...baseInput,
        memo,
      });
      expect(alert.level).toBe("red");
      expect(alert.reasons.some((r) => r.includes(word))).toBe(true);
    }
  });

  it("does not flag rent memos as tax ('thuê nhà', 'thuê phòng', 'thuê xe')", () => {
    const rentMemos = [
      "Tien thue nha thang 10",
      "Thanh toan thue phong tro",
      "Tien thue xe tu lai",
      "Tien thue mat bang kinh doanh",
      "Tiền thuê nhà tháng 10",
    ];

    for (const memo of rentMemos) {
      const alert = transferAlertLevel({
        ...baseInput,
        memo,
      });
      expect(alert.level).toBe("green");
      expect(alert.reasons).toHaveLength(0);
    }
  });

  it("flags YELLOW for single or double mild risk reasons", () => {
    // 1 reason: New payee
    const r1 = transferAlertLevel({ ...baseInput, isNewPayee: true });
    expect(r1.level).toBe("yellow");
    expect(r1.reasons).toEqual(["Người nhận mới"]);

    // 1 reason: Threshold >= 10M
    const r2 = transferAlertLevel({ ...baseInput, amount: 15_000_000 });
    expect(r2.level).toBe("yellow");
    expect(r2.reasons).toEqual(["Số tiền từ 10 triệu đồng trở lên"]);

    // 1 reason: Midnight hour (23:00 - 05:00 UTC+7)
    const r3 = transferAlertLevel({ ...baseInput, postedAt: midnightUtc });
    expect(r3.level).toBe("yellow");
    expect(r3.reasons).toEqual(["Chuyển khoản lúc nửa đêm (23:00–05:00)"]);

    // 2 reasons: New payee + Midnight -> still yellow
    const r4 = transferAlertLevel({ ...baseInput, isNewPayee: true, postedAt: midnightUtc });
    expect(r4.level).toBe("yellow");
    expect(r4.reasons).toHaveLength(2);
  });

  it("escalates to RED when 3 or more mild reasons combine", () => {
    const alert = transferAlertLevel({
      ...baseInput,
      isNewPayee: true,
      amount: 20_000_000,
      postedAt: midnightUtc,
    });
    expect(alert.level).toBe("red");
    expect(alert.reasons).toHaveLength(3);
  });
});
