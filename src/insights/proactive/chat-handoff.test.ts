import { beforeEach, describe, expect, it } from "vitest";
import { saveChatDraft, takeInsightDraft } from "./chat-handoff";

beforeEach(() => sessionStorage.clear());

describe("saveChatDraft", () => {
  it("hands a plain prompt to the chat composer once, for that persona only", () => {
    expect(saveChatDraft("CIF_0001", "Kiểm tra bảo mật cho link sau: https://x.vn")).toBe(true);
    expect(takeInsightDraft("CIF_0002")).toBeNull();
    expect(takeInsightDraft("CIF_0001")).toEqual({
      draft: "Kiểm tra bảo mật cho link sau: https://x.vn",
      visibleText: "Kiểm tra bảo mật cho link sau: https://x.vn",
    });
    expect(takeInsightDraft("CIF_0001")).toBeNull();
  });
});
