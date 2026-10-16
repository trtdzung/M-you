import { describe, expect, it } from "vitest";
import { makeCtx } from "@/ai/pipeline/__tests__/harness";
import {
  findRecipient,
  maskAccount,
  prepareTransferDraft,
  TIER_B_TOOL_NAMES,
} from "../draft-tools";
import { toolSchemas } from "../registry";

describe("findRecipient — real records only, never fabricated", () => {
  it("resolves a saved beneficiary by name (masked, not a new payee)", async () => {
    const ctx = await makeCtx();
    const res = findRecipient("Lan", ctx);
    expect(res.status).toBe("resolved");
    if (res.status !== "resolved") return;
    expect(res.recipient.recipientName).toContain("Lan");
    expect(res.recipient.recipientSource).toBe("saved_beneficiary");
    expect(res.recipient.isNewPayee).toBe(false);
    expect(res.recipient.recipientAccountMasked).toBe("****8901");
  });

  it("resolves a payee from transaction history (real counterparty account, new payee)", async () => {
    const ctx = await makeCtx();
    const res = findRecipient("Phạm Thu Hà", ctx);
    expect(res.status).toBe("resolved");
    if (res.status !== "resolved") return;
    expect(res.recipient.recipientSource).toBe("transaction_history");
    expect(res.recipient.isNewPayee).toBe(true);
    expect(res.recipient.recipientAccountMasked).toBe("****6677");
  });

  it("accepts a user-typed account number as user_typed (new payee)", async () => {
    const ctx = await makeCtx();
    const res = findRecipient("999888777666", ctx);
    expect(res.status).toBe("resolved");
    if (res.status !== "resolved") return;
    expect(res.recipient.recipientSource).toBe("user_typed");
    expect(res.recipient.isNewPayee).toBe(true);
    expect(res.recipient.recipientAccountMasked).toBe("****7666");
  });

  it("matches a saved beneficiary by exact typed account number", async () => {
    const ctx = await makeCtx();
    const res = findRecipient("19012345678901", ctx);
    expect(res.status).toBe("resolved");
    if (res.status !== "resolved") return;
    expect(res.recipient.recipientSource).toBe("saved_beneficiary");
  });

  it("returns not_found for an unknown name — never invents an account", async () => {
    const ctx = await makeCtx();
    const res = findRecipient("Nguyễn Văn Zzz", ctx);
    expect(res.status).toBe("not_found");
  });

  it("returns ambiguous when several saved payees match", async () => {
    const ctx = await makeCtx();
    const res = findRecipient("Văn", ctx); // Trần Văn Bình + Phạm Văn Đức
    expect(res.status).toBe("ambiguous");
    if (res.status !== "ambiguous") return;
    expect(res.candidates.length).toBeGreaterThan(1);
    for (const c of res.candidates) expect(c.masked).toMatch(/^\*{4}\d{4}$/);
  });

  it("masks to the last four digits", () => {
    expect(maskAccount("0281000556677")).toBe("****6677");
  });
});

describe("prepareTransferDraft — assemble + validate, never execute", () => {
  it("builds a draft from a resolved recipient", async () => {
    const ctx = await makeCtx();
    const found = findRecipient("Lan", ctx);
    if (found.status !== "resolved") throw new Error("expected resolved");
    const source = ctx.raw.accounts.find((a) => a.type === "current")!;
    const res = prepareTransferDraft(
      {
        recipient: found.recipient,
        amount: 5_000_000,
        memo: "an trua",
        sourceAccountId: source.id,
        riskFlags: [],
        thresholdHit: false,
        requiresReconfirm: false,
        requestId: "req_test",
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.status).toBe("draft");
    expect(res.draft.createdBy).toBe("agent");
    expect(res.draft.amount).toBe(5_000_000);
    // No OTP/credential/execution field exists on the draft shape.
    expect(Object.keys(res.draft)).not.toContain("otp");
  });

  it("rejects a non-existent source account", async () => {
    const ctx = await makeCtx();
    const found = findRecipient("Lan", ctx);
    if (found.status !== "resolved") throw new Error("expected resolved");
    const res = prepareTransferDraft(
      {
        recipient: found.recipient,
        amount: 1_000_000,
        memo: null,
        sourceAccountId: "does-not-exist",
        riskFlags: [],
        thresholdHit: false,
        requiresReconfirm: false,
        requestId: "req_test",
      },
      ctx,
    );
    expect(res.ok).toBe(false);
  });
});

describe("Tier B is never exposed to the LLM", () => {
  it("keeps the draft tools out of the LLM tool schema", () => {
    const names = toolSchemas().map((t) => t.name);
    for (const forbidden of TIER_B_TOOL_NAMES) {
      expect(names).not.toContain(forbidden);
    }
  });
});
