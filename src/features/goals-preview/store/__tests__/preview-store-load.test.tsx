import React from "react";
import { render, waitFor, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialPreviewState } from "../reducer";

const data = vi.hoisted(() => ({
  cif: "CIF_0001",
  ctx: null as null | {
    loadStatus: string;
    state: { goals: { id: string }[] };
    dispatch: (a: unknown) => void;
    reload: () => void;
  },
  posts: 0,
}));

vi.mock("@/providers/context", () => ({
  usePersonaCif: () => data.cif,
}));

vi.mock("@/components/shell/PanelActive", () => ({
  usePanelActive: () => true,
}));

import { PreviewStoreProvider, usePreview } from "../PreviewStore";

function Probe() {
  data.ctx = usePreview() as typeof data.ctx;
  return <div>{data.ctx?.loadStatus}</div>;
}

afterEach(() => {
  cleanup();
  data.posts = 0;
  data.cif = "CIF_0001";
  vi.unstubAllGlobals();
});

describe("PreviewStore F7 tải world", () => {
  it("GET lỗi ban đầu khoá thao tác nghiệp vụ; retry rồi đổi CIF lỗi → 0 goals", async () => {
    let fail = true;
    const state = initialPreviewState();
    const world = {
      ...state,
      customer: { ...state.customer, cif: "CIF_0001" },
      goals: [{ id: "sentinel", name: "customer A", status: "draft" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") data.posts += 1;
        if (fail) throw new Error("injected GET failure");
        return new Response(
          JSON.stringify({ world, market: { instruments: [], refreshing: false, asOf: null } }),
        );
      }),
    );

    const r = render(
      <PreviewStoreProvider>
        <Probe />
      </PreviewStoreProvider>,
    );
    await waitFor(() => expect(data.ctx?.loadStatus).toBe("error"));
    act(() =>
      data.ctx!.dispatch({
        type: "createGoal",
        input: {
          name: "blocked",
          template: "other",
          targetAmount: 1e8,
          targetDate: "2028-12-31",
          flexibility: "date_flexible",
        },
      }),
    );
    expect(data.ctx!.state.goals.length).toBe(0);
    expect(data.posts).toBe(0);

    fail = false;
    act(() => data.ctx!.reload());
    await waitFor(() => expect(data.ctx?.loadStatus).toBe("ready"));
    expect(data.ctx!.state.goals[0]?.id).toBe("sentinel");

    fail = true;
    data.cif = "CIF_0002";
    r.rerender(
      <PreviewStoreProvider>
        <Probe />
      </PreviewStoreProvider>,
    );
    await waitFor(() => expect(data.ctx?.loadStatus).toBe("error"));
    expect(data.ctx!.state.goals.length).toBe(0);
  });
});
