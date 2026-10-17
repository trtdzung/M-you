import { describe, it, expect, vi, afterEach } from "vitest";
import { isChartUi, isTransferFormUi, type ChartUi, type TransferFormUi } from "./agent-api";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("sendChatMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the same-origin agent-chat proxy with the message and cif as user_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ answer: "hi", thread_id: "CIF_0001" }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendChatMessage } = await import("./agent-api");
    const result = await sendChatMessage("hello", "CIF_0001");

    expect(result).toEqual({ answer: "hi", thread_id: "CIF_0001" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agent/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ message: "hello", user_id: "CIF_0001" });
  });

  it("throws when the proxy responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    vi.stubGlobal("fetch", fetchMock);

    const { sendChatMessage } = await import("./agent-api");
    await expect(sendChatMessage("hello", "CIF_0001")).rejects.toThrow("Agent API error 502");
  });
});

describe("getChatHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the same-origin agent-chat proxy with cif as the user_id query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ thread_id: "CIF_0001", messages: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { getChatHistory } = await import("./agent-api");
    const result = await getChatHistory("CIF_0001");

    expect(result).toEqual({ thread_id: "CIF_0001", messages: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/chat?user_id=CIF_0001");
  });

  it("throws when the proxy responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    vi.stubGlobal("fetch", fetchMock);

    const { getChatHistory } = await import("./agent-api");
    await expect(getChatHistory("CIF_0001")).rejects.toThrow("Agent API error 502");
  });
});

describe("deleteChatHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETEs the same-origin agent-chat proxy with cif as the user_id query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ thread_id: "CIF_0001", status: "deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    const { deleteChatHistory } = await import("./agent-api");
    await deleteChatHistory("CIF_0001");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agent/chat?user_id=CIF_0001");
    expect(init.method).toBe("DELETE");
  });

  it("throws when the proxy responds with a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    vi.stubGlobal("fetch", fetchMock);

    const { deleteChatHistory } = await import("./agent-api");
    await expect(deleteChatHistory("CIF_0001")).rejects.toThrow("Agent API error 502");
  });
});

describe("isChartUi", () => {
  const validPie: ChartUi = {
    type: "chart",
    chart_type: "pie",
    title: "Chi tiêu theo danh mục",
    labels: ["Mua sắm", "Ăn uống"],
    series: [{ name: "VND", data: [16280000, 10500000] }],
  };

  it("is true for a well-formed chart payload", () => {
    expect(isChartUi(validPie)).toBe(true);
  });

  it("is true for bar/line with multiple series, each matching labels length", () => {
    expect(
      isChartUi({
        type: "chart",
        chart_type: "bar",
        title: "Thu chi 3 tháng",
        labels: ["06", "07", "08"],
        series: [
          { name: "Thu", data: [1, 2, 3] },
          { name: "Chi", data: [4, 5, 6] },
        ],
      }),
    ).toBe(true);
  });

  it("is false for null/undefined", () => {
    expect(isChartUi(null)).toBe(false);
    expect(isChartUi(undefined)).toBe(false);
  });

  it("is false for other/unsupported ui types (never throws)", () => {
    expect(isChartUi({ type: "transfer_form" })).toBe(false);
    expect(isChartUi({ type: "create_jar" })).toBe(false);
  });

  it("is false for an invalid chart_type", () => {
    expect(isChartUi({ ...validPie, chart_type: "scatter" } as unknown as ChartUi)).toBe(false);
  });

  it("is false when a series' data length doesn't match labels length", () => {
    expect(isChartUi({ ...validPie, series: [{ name: "VND", data: [1] }] })).toBe(false);
  });

  it("is false when series is empty or missing", () => {
    expect(isChartUi({ ...validPie, series: [] })).toBe(false);
    expect(isChartUi({ type: "chart", chart_type: "pie", title: "t", labels: [] })).toBe(false);
  });
});

/**
 * The agent's `category` is whitelist-validated, never trusted (invariant #2).
 * Against the BUNDLED presets that whitelist silently excludes every category the
 * user created, so the card never renders for them; the persona's stored
 * assignable set is the correct whitelist. Widening it is not an option — an id
 * outside the set must still be rejected.
 */
describe("isTransferFormUi (whitelist validation)", () => {
  const form: TransferFormUi = {
    type: "transfer_form",
    beneficiary_id: "ben-1",
    amount: 500_000,
    note: "Học phí tháng 9",
    category: "dining",
  };

  it("is true for a well-formed payload on a preset category", () => {
    expect(isTransferFormUi(form)).toBe(true);
  });

  it("accepts a CUSTOM category when the stored expense set is passed", () => {
    const custom = { ...form, category: "c_hoc-phi" };
    expect(isTransferFormUi(custom)).toBe(false); // bundled presets: the bug
    expect(isTransferFormUi(custom, new Set(["dining", "c_hoc-phi"]))).toBe(true);
  });

  it("rejects an id outside the passed set — the set is never widened", () => {
    expect(isTransferFormUi({ ...form, category: "c_ghost" }, new Set(["dining"]))).toBe(false);
    expect(isTransferFormUi({ ...form, category: "transfer" }, new Set(["dining"]))).toBe(false);
  });

  it("is false for a malformed payload, never throws", () => {
    expect(isTransferFormUi(null)).toBe(false);
    expect(isTransferFormUi({ type: "chart" })).toBe(false);
    expect(isTransferFormUi({ ...form, amount: 0 })).toBe(false);
    expect(isTransferFormUi({ ...form, beneficiary_id: "  " })).toBe(false);
  });
});
