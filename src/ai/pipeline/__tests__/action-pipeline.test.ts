import { describe, expect, it } from "vitest";
import { makeCtx } from "./harness";
import { runActionPipeline, isTransferConfirmation, type ActionTrace } from "../action-pipeline";
import type { AssistantEvent } from "../events";
import type { ChatMessage } from "../orchestrator";

function run(messages: ChatMessage[], ctx: Awaited<ReturnType<typeof makeCtx>>): { events: AssistantEvent[]; trace: ActionTrace } {
  const trace: ActionTrace = {};
  const events = [...runActionPipeline({ messages, ctx }, trace, "req_test")];
  return { events, trace };
}

const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });

describe("action pipeline — draft-only, deterministic", () => {
  it("happy path: saved beneficiary under threshold → draft (no risk flags)", async () => {
    const ctx = await makeCtx();
    const { events, trace } = run([user("Chuyển 5 triệu cho Lan")], ctx);
    const draft = events.find((e) => e.type === "draft");
    expect(draft).toBeTruthy();
    if (draft?.type !== "draft") return;
    expect(draft.draft.amount).toBe(5_000_000);
    expect(draft.draft.riskFlags).toEqual([]);
    expect(draft.draft.recipientAccountMasked).toBe("****8901");
    expect(trace.draft?.outcome).toBe("draft");
    // The full account number never leaves the server; only the mask does.
    expect(JSON.stringify(events)).not.toContain("19012345678901");
    expect(JSON.stringify(events)).toContain("****8901");
  });

  it("over threshold → re-confirm first (no draft yet)", async () => {
    const ctx = await makeCtx();
    const { events, trace } = run([user("Chuyển 15 triệu cho Lan")], ctx);
    expect(events.some((e) => e.type === "reconfirm")).toBe(true);
    expect(events.some((e) => e.type === "draft")).toBe(false);
    expect(trace.draft?.outcome).toBe("reconfirm");
    expect(trace.draft?.thresholdHit).toBe(true);
  });

  it("over threshold → drafts after the human confirms in-chat", async () => {
    const ctx = await makeCtx();
    const msgs = [user("Chuyển 15 triệu cho Lan"), assistant("Cần xác nhận lại..."), user("đồng ý")];
    expect(isTransferConfirmation(msgs)).toBe(true);
    const { events } = run(msgs, ctx);
    const draft = events.find((e) => e.type === "draft");
    expect(draft).toBeTruthy();
    if (draft?.type !== "draft") return;
    expect(draft.draft.amount).toBe(15_000_000);
    expect(draft.draft.riskFlags).toContain("over_threshold");
  });

  it("new payee + large + urgency → fraud checkpoint with risk flags", async () => {
    const ctx = await makeCtx();
    const { events } = run([user("Chuyển 6 triệu cho Phạm Thu Hà gấp")], ctx);
    const rc = events.find((e) => e.type === "reconfirm");
    expect(rc).toBeTruthy();
    if (rc?.type !== "reconfirm") return;
    expect(rc.reason).toBe("fraud_checkpoint");
    expect(rc.riskFlags).toContain("new_payee");
    expect(rc.riskFlags).toContain("urgency_language");
  });

  it("ambiguous recipient → clarify (no draft)", async () => {
    const ctx = await makeCtx();
    const { events } = run([user("Chuyển 5 triệu cho Văn")], ctx);
    expect(events.some((e) => e.type === "clarify")).toBe(true);
    expect(events.some((e) => e.type === "draft")).toBe(false);
  });

  it("missing amount → clarify (no draft)", async () => {
    const ctx = await makeCtx();
    const { events } = run([user("Chuyển tiền cho Lan")], ctx);
    const clarify = events.find((e) => e.type === "clarify");
    expect(clarify).toBeTruthy();
    expect(events.some((e) => e.type === "draft")).toBe(false);
  });

  it("adjacency: an unrelated later 'ok' does NOT resurrect a stale over-threshold draft", async () => {
    const ctx = await makeCtx();
    // Turn 1 asks a big transfer (reconfirm), user then changes topic, and only
    // later says "ok" to something else. That must NOT be read as confirmation.
    const msgs = [
      user("Chuyển 15 triệu cho Lan"),
      assistant("Số tiền vượt ngưỡng, cần bạn xác nhận lại..."),
      user("Thôi, tháng này tôi chi tiêu bao nhiêu?"),
      assistant("Tháng này bạn chi 8 triệu. Xem theo danh mục không?"),
      user("ok"),
    ];
    expect(isTransferConfirmation(msgs)).toBe(false);
    const { events } = run(msgs, ctx);
    expect(events.some((e) => e.type === "draft")).toBe(false);
  });
});
