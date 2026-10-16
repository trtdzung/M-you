import { describe, expect, it } from "vitest";
import { hasScope, type ConsentRecord } from "../consent";

const record = (scopes: ConsentRecord["scopes"]): ConsentRecord => ({
  version: "2026-09-01",
  acceptedAt: "2026-09-01T00:00:00.000Z",
  scopes,
});

describe("hasScope (Red Team #2)", () => {
  it("is true only when the scope is present", () => {
    expect(hasScope(record(["transactions", "ai"]), "ai")).toBe(true);
    expect(hasScope(record(["transactions"]), "ai")).toBe(false);
  });

  it("is false for a null record", () => {
    expect(hasScope(null, "ai")).toBe(false);
  });
});
