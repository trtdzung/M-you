import { describe, expect, it } from "vitest";
import { avatarColor, initialOf } from "./avatar";

describe("initialOf", () => {
  it("returns the uppercased first character of a name", () => {
    expect(initialOf("Nguyễn Thị Lan")).toBe("N");
    expect(initialOf("vietcombank")).toBe("V");
  });

  it("falls back to '?' for an empty or blank name", () => {
    expect(initialOf("")).toBe("?");
    expect(initialOf("   ")).toBe("?");
  });
});

describe("avatarColor", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarColor("Nguyễn Thị Lan")).toBe(avatarColor("Nguyễn Thị Lan"));
  });

  it("returns a valid hex color", () => {
    expect(avatarColor("BIDV")).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("varies across different seeds (not a constant fallback)", () => {
    const colors = new Set(["Vietcombank", "BIDV", "VietinBank", "Techcombank", "ACB", "MB Bank"].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
