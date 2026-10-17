import { describe, expect, it } from "vitest";
import { MAX_VND } from "@/domain/models/asset-liability-input";
import { validateLedgerEntry } from "../validate-ledger";

describe("validateLedgerEntry", () => {
  it("accepts a deposit without note", () => {
    const r = validateLedgerEntry({ kind: "deposit", amount: 1000 });
    expect(r).toMatchObject({ ok: true, value: { kind: "deposit", amount: 1000, note: null } });
  });

  it("requires a non-empty note for withdraw", () => {
    expect(validateLedgerEntry({ kind: "withdraw", amount: 5 }).errors.note).toBeDefined();
    expect(validateLedgerEntry({ kind: "withdraw", amount: 5, note: "  " }).errors.note).toBeDefined();
    const r = validateLedgerEntry({ kind: "withdraw", amount: 5, note: " Tôi chấp nhận " });
    expect(r.value?.note).toBe("Tôi chấp nhận");
  });

  it("rejects bad kind", () => {
    expect(validateLedgerEntry({ kind: "x", amount: 5 }).errors.kind).toBeDefined();
    expect(validateLedgerEntry(null).errors.kind).toBeDefined();
  });

  it.each([0, -1, 1.5, Number.NaN, "10", MAX_VND + 1, undefined])("rejects amount %s", (v) => {
    expect(validateLedgerEntry({ kind: "deposit", amount: v }).errors.amount).toBeDefined();
  });

  it("accepts amount = MAX_VND", () => {
    expect(validateLedgerEntry({ kind: "deposit", amount: MAX_VND }).ok).toBe(true);
  });
});
