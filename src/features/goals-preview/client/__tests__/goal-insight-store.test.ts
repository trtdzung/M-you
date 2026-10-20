import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetGoalInsights, syncGoalInsights, useGoalInsight } from "../goal-insight-store";

const card = { goalName: "Mua xe", observation: "Bạn đang đi chậm.", suggestion: "Gửi thêm.", question: "Mình nên gửi thêm thế nào?" };

afterEach(() => {
  resetGoalInsights();
  vi.restoreAllMocks();
});

describe("goal insight store", () => {
  it("nạp một lần cho cả khách; mở chi tiết đọc từ state, không gọi thêm", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ insights: { "goal-1": card, "goal-2": null }, refreshing: false })),
    );
    const { result } = renderHook(() => useGoalInsight("goal-1"));
    expect(result.current).toBeNull();
    await act(async () => syncGoalInsights("CIF_0001"));
    await waitFor(() => expect(result.current?.observation).toBe("Bạn đang đi chậm."));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/goals-v2/insight?cif=CIF_0001");
    const other = renderHook(() => useGoalInsight("goal-1"));
    expect(other.result.current?.question).toBe("Mình nên gửi thêm thế nào?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lần nạp sau chưa có thẻ (đang viết lại) thì không xoá thẻ đang hiện", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ insights: { "goal-1": card }, refreshing: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ insights: { "goal-1": null }, refreshing: false })));
    const { result } = renderHook(() => useGoalInsight("goal-1"));
    await act(async () => syncGoalInsights("CIF_0001"));
    await waitFor(() => expect(result.current).not.toBeNull());
    await act(async () => syncGoalInsights("CIF_0001"));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(result.current?.observation).toBe("Bạn đang đi chậm.");
  });

  it("đổi khách thì bỏ thẻ của khách cũ", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ insights: { "goal-1": card }, refreshing: false })));
    const { result } = renderHook(() => useGoalInsight("goal-1"));
    await act(async () => syncGoalInsights("CIF_0001"));
    await waitFor(() => expect(result.current).not.toBeNull());
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    await act(async () => syncGoalInsights("CIF_0002"));
    expect(result.current).toBeNull();
  });
});
