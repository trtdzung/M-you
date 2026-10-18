import { describe, expect, it } from "vitest";
import type { Transaction } from "@/domain/models";
import {
  accountLastFour,
  isTrustedRecipient,
  transferAlertLevel,
  transferHistory,
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

describe("transferAlertLevel (AI Agent Fraud spec levels)", () => {
  const daytimeUtc = new Date("2026-10-14T05:00:00Z"); // 12:00 in UTC+7
  const midnightUtc = new Date("2026-10-14T17:00:00Z"); // 00:00 in UTC+7
  const lateUtc = new Date("2026-10-14T16:30:00Z"); // 23:30 in UTC+7
  const earlyUtc = new Date("2026-10-14T19:00:00Z"); // 02:00 in UTC+7, outside 23–01
  const trusted = [{ name: "Nguyễn Văn A", account: "00001234", bank: "MSB" }];

  const baseInput: TransferAlertInput = {
    amount: 1_000_000,
    isNewPayee: false,
    recipientName: "Lê Văn B",
    recipientAccount: "99998888",
    recipientBank: "MSB",
    memo: "Chuyen tien an trua",
    postedAt: daytimeUtc,
    aiProtect: true,
    trusted,
    largestOutflow90d: 5_000_000,
    balance: 20_000_000,
  };
  // New payee + amount from 50% of balance = T1 + T3.
  const t1t3: TransferAlertInput = { ...baseInput, isNewPayee: true, amount: 12_000_000 };

  it("returns green when aiProtect is disabled, ignoring all risk factors", () => {
    expect(transferAlertLevel({ ...t1t3, aiProtect: false, postedAt: midnightUtc, memo: "nop thue gap" })).toEqual({ level: "green", reasons: [] });
  });

  it("returns green for trusted recipients even with a large amount at night", () => {
    expect(transferAlertLevel({ ...t1t3, recipientName: "Nguyễn Văn A", recipientAccount: "11111234", amount: 100_000_000, postedAt: midnightUtc })).toEqual({ level: "green", reasons: [] });
  });

  it("stays green with only one medium or context signal", () => {
    expect(transferAlertLevel({ ...baseInput, isNewPayee: true }).level).toBe("green"); // T1 alone
    expect(transferAlertLevel({ ...baseInput, amount: 15_000_000 }).level).toBe("green"); // T3 alone
    expect(transferAlertLevel({ ...baseInput, postedAt: midnightUtc }).level).toBe("green"); // T8 alone
    expect(transferAlertLevel({ ...baseInput, memo: "nop thue" }).level).toBe("green"); // T8 alone
    expect(transferAlertLevel({ ...baseInput, isNewPayee: true, postedAt: midnightUtc }).level).toBe("green"); // T1 + T8, no Yellow to raise
  });

  it("flags YELLOW on a name spoof (T1b): same name as someone known, different account", () => {
    const alert = transferAlertLevel({ ...baseInput, isNewPayee: true, recipientName: "Nguyễn Văn A", recipientAccount: "99999999" });
    expect(alert.level).toBe("yellow");
    expect(alert.reasons).toContain("Tên giống người quen, khác số tài khoản hoặc ngân hàng");
  });

  it("flags T1b on a different bank with the same last 4 digits, and against past recipients", () => {
    expect(transferAlertLevel({ ...baseInput, recipientName: "Nguyen Van A", recipientAccount: "55551234", recipientBank: "Vietcombank" }).level).toBe("yellow");
    const past = [{ name: "Trần Thị C", account: "0281000556677", bank: "MSB" }];
    expect(transferAlertLevel({ ...baseInput, pastRecipients: past, recipientName: "tran thi c", recipientAccount: "0281000999999" }).level).toBe("yellow");
    // Same person, same account as before: not new, not a spoof.
    expect(transferAlertLevel({ ...baseInput, isNewPayee: true, pastRecipients: past, recipientName: "Trần Thị C", recipientAccount: "0281000556677", amount: 12_000_000 })).toEqual({ level: "green", reasons: [] });
  });

  it("flags YELLOW on a new payee with an unusually large amount (T1 + T3)", () => {
    const byBalance = transferAlertLevel(t1t3);
    expect(byBalance.level).toBe("yellow");
    expect(byBalance.reasons).toEqual(["Người nhận mới", "Số tiền từ 50% số dư trở lên"]);

    const byHistory = transferAlertLevel({ ...baseInput, isNewPayee: true, amount: 15_000_000, balance: 100_000_000 });
    expect(byHistory.level).toBe("yellow");
    expect(byHistory.reasons).toContain("Số tiền gấp 3 lần giao dịch lớn nhất trong 90 ngày");
  });

  it("never fires T3 on unknown history or balance", () => {
    expect(transferAlertLevel({ ...t1t3, largestOutflow90d: null, balance: null }).level).toBe("green");
  });

  it("escalates any Yellow to RED with a context signal (T8)", () => {
    const night = transferAlertLevel({ ...t1t3, postedAt: lateUtc });
    expect(night.level).toBe("red");
    expect(night.reasons).toContain("Chuyển khoản lúc nửa đêm (23:00–01:00)");

    const spoofAtNight = transferAlertLevel({ ...baseInput, recipientName: "Nguyễn Văn A", recipientAccount: "99999999", postedAt: midnightUtc });
    expect(spoofAtNight.level).toBe("red");

    // 02:00 is outside the 23:00–01:00 window.
    expect(transferAlertLevel({ ...t1t3, postedAt: earlyUtc }).level).toBe("yellow");
  });

  it("matches the spec keywords in the memo", () => {
    const keywords = [
      { memo: "Nop tien thue ca nhan", word: "thuế" },
      { memo: "Dong tien phat nguoi", word: "phạt" },
      { memo: "Chuyen vao tai khoan an toan", word: "tài khoản an toàn" },
      { memo: "Hoan thanh nhiem vu", word: "nhiệm vụ" },
      { memo: "Chuyen gap", word: "gấp" },
    ];
    for (const { memo, word } of keywords) {
      const alert = transferAlertLevel({ ...t1t3, memo });
      expect(alert.level).toBe("red");
      expect(alert.reasons.some(reason => reason.includes(word))).toBe(true);
    }
  });

  it("does not read rent memos as tax ('thuê nhà', 'thuê phòng', 'thuê xe')", () => {
    for (const memo of ["Tien thue nha thang 10", "Thanh toan thue phong tro", "Tien thue xe tu lai", "Tien thue mat bang kinh doanh", "Tiền thuê nhà tháng 10"]) {
      expect(transferAlertLevel({ ...t1t3, memo }).level).toBe("yellow");
    }
  });
});

describe("transferHistory", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const txn = (patch: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36), accountId: "acc", postedAt: "2026-09-01T00:00:00Z", amount: 1_000_000, currency: "VND",
    direction: "debit", type: "transfer", merchantName: "Trần Thị C", merchantNormalizedName: "tran thi c", categoryId: "transfer",
    status: "posted", source: "mock", isRecurring: false, userEdited: false, counterpartyAccountNumber: "0281000556677", counterpartyBankName: "MSB", ...patch,
  });

  it("collects past recipients and the largest posted outflow in 90 days", () => {
    const result = transferHistory([
      txn({ amount: 3_000_000 }),
      txn({ amount: 9_000_000, type: "expense", counterpartyAccountNumber: undefined }),
      txn({ amount: 50_000_000, postedAt: "2026-05-01T00:00:00Z" }), // older than 90 days
      txn({ amount: 40_000_000, status: "pending" }),
      txn({ amount: 30_000_000, transferGroupId: "internal-1" }),
      txn({ amount: 20_000_000, direction: "credit" }),
    ], now);
    expect(result.largestOutflow90d).toBe(9_000_000);
    expect(result.pastRecipients).toContainEqual({ name: "Trần Thị C", account: "0281000556677", bank: "MSB" });
  });

  it("returns null when there is no outflow in the window", () => {
    expect(transferHistory([], now)).toEqual({ pastRecipients: [], largestOutflow90d: null });
  });
});
