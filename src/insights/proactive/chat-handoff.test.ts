import { beforeEach, describe, expect, it } from "vitest";
import { savePendingChatMessage, takePendingChatMessage, takeInsightDraft } from "./chat-handoff";

beforeEach(() => sessionStorage.clear());

describe("pending chat message", () => {
  it("is handed to the chat once, for that persona only, and never mixes with insight drafts", () => {
    expect(savePendingChatMessage("CIF_0001", "Kiểm tra bảo mật cho link sau: https://x.vn")).toBe(true);
    expect(takeInsightDraft("CIF_0001")).toBeNull();
    expect(takePendingChatMessage("CIF_0002")).toBeNull();
    expect(takePendingChatMessage("CIF_0001")).toBe("Kiểm tra bảo mật cho link sau: https://x.vn");
    expect(takePendingChatMessage("CIF_0001")).toBeNull();
  });
  it("expires stale messages", () => {
    savePendingChatMessage("CIF_0001", "cũ");
    const key = "pfm.chat-pending:CIF_0001";
    sessionStorage.setItem(key, JSON.stringify({ text: "cũ", expires: Date.now() - 1 }));
    expect(takePendingChatMessage("CIF_0001")).toBeNull();
  });
});
