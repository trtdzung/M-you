import { render, waitFor, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stateFromScenario } from "../reducer";

vi.mock("@/providers/context", () => ({ usePersonaCif: () => "CIF_0001" }));
vi.mock("@/components/shell/PanelActive", () => ({ usePanelActive: () => true }));

import { PreviewStoreProvider, usePreview } from "../PreviewStore";
import { GOALS_CHANGED_EVENT } from "../server-sync";

const box = vi.hoisted(() => ({ ctx: null as any }));
function Probe() {
  box.ctx = usePreview();
  return null;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PreviewStore: a chat card changed the goals", () => {
  it("re-reads the world quietly when GOALS_CHANGED_EVENT fires, keeping the navigation", async () => {
    const world = stateFromScenario("s13-loan-blocked");
    let roadmapSet = false;
    const fetchMock = vi.fn(async () => {
      const goals = world.goals.map((g, i) => (i === 0 && roadmapSet ? { ...g, roadmap: { planId: "no_loan", planName: "Không vay", chosenAt: "2026-10-21", milestones: [] } } : g));
      return new Response(JSON.stringify({ world: { ...world, goals, customer: { ...world.customer, cif: "CIF_0001" } }, market: { instruments: [], refreshing: false, asOf: null } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PreviewStoreProvider>
        <Probe />
      </PreviewStoreProvider>,
    );
    await waitFor(() => expect(box.ctx?.loadStatus).toBe("ready"));
    const goalId = box.ctx.state.goals[0].id;
    await act(async () => box.ctx.nav.push("GoalDetail", { goalId }));
    const stackBefore = box.ctx.state.nav.stack.length;
    expect(box.ctx.state.goals[0].roadmap).toBeUndefined();

    roadmapSet = true;
    await act(async () => {
      window.dispatchEvent(new Event(GOALS_CHANGED_EVENT));
    });
    await waitFor(() => expect(box.ctx.state.goals[0].roadmap?.planId).toBe("no_loan"));
    expect(box.ctx.loadStatus).toBe("ready");
    expect(box.ctx.state.nav.stack.length).toBe(stackBefore);
  });
});
