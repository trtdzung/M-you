import { describe, expect, it } from "vitest";
import { checkFraud, checkOfficialChannel, listPromotions, normalizeValue } from "../msb-reference";

const NOW = new Date("2026-09-15T00:00:00.000Z");

describe("promotions", () => {
  it("labels each promotion active / upcoming / expired against the given date", () => {
    const status = Object.fromEntries(listPromotions({}, NOW).map((p) => [p.id, p.status]));
    expect(status["promo-card-dining-2026q3"]).toBe("active");
    expect(status["promo-saving-open-2026q4"]).toBe("upcoming");
    expect(status["promo-summer-travel-2026"]).toBe("expired");
  });
  it("filters by status and by accent-insensitive keyword", () => {
    expect(listPromotions({ status: "active" }, NOW).every((p) => p.status === "active")).toBe(true);
    expect(listPromotions({ q: "hoan tien" }, NOW).map((p) => p.id)).toContain("promo-card-dining-2026q3");
    expect(listPromotions({ q: "hoan tien", status: "active" }, NOW).map((p) => p.id)).toEqual(["promo-card-dining-2026q3"]);
    expect(listPromotions({ q: "khong co chuong trinh nay" }, NOW)).toEqual([]);
  });
});

describe("normalizeValue", () => {
  it("reduces phones/accounts to digits and domains to the bare host", () => {
    expect(normalizeValue("090 000.0001")).toEqual({ type: "number", value: "0900000001" });
    expect(normalizeValue("https://www.MSB-Hoantien.com/nhan-qua?id=1")).toEqual({ type: "domain", value: "msb-hoantien.com" });
  });
});

describe("official channels", () => {
  it("accepts msb.com.vn and its subdomains, rejects look-alikes", () => {
    expect(checkOfficialChannel("https://ebank.msb.com.vn/login").official).toBe(true);
    expect(checkOfficialChannel("msb.com.vn").official).toBe(true);
    expect(checkOfficialChannel("msb-hoantien.com").official).toBe(false);
    expect(checkOfficialChannel("msb.com.vn.evil.com").official).toBe(false);
    expect(checkOfficialChannel("notmsb.com.vn").official).toBe(false);
  });
  it("matches a hotline regardless of spacing", () => {
    const r = checkOfficialChannel("19001234");
    expect(r.official).toBe(true);
    expect(r.channel?.type).toBe("hotline");
    expect(checkOfficialChannel("0912345678").official).toBe(false);
  });
});

describe("fraud watchlist", () => {
  it("finds a reported phone however it is typed, and a reported domain inside a URL", () => {
    expect(checkFraud("090 000 0001").found).toBe(true);
    expect(checkFraud("https://msb-hoantien.com/x").entries[0].id).toBe("fr-domain-1");
  });
  it("says not found (not 'safe') for unknown values", () => {
    expect(checkFraud("0912345678")).toMatchObject({ found: false, entries: [] });
  });
});
