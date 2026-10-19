import { describe, expect, it } from "vitest";
import { initialPreviewState, previewReducer } from "../reducer";

describe("preview navigation history", () => {
  it("returns to the exact detail tab and filter without adding a history entry", () => {
    let state = initialPreviewState();
    state = previewReducer(state, { type: "nav/reset", screen: "GoalList", params: { listTab: "history" } });
    const listKey = state.nav.stack[0].key;
    state = previewReducer(state, { type: "nav/push", screen: "GoalDetail", params: { goalId: "goal-1" } });
    const detailKey = state.nav.stack[1].key;
    state = previewReducer(state, { type: "nav/params", params: { tab: "cash", cashFilter: "invest" } });
    expect(state.nav.stack).toHaveLength(2);
    expect(state.nav.stack[1].key).toBe(detailKey);
    state = previewReducer(state, { type: "nav/push", screen: "StandingOrderManage", params: { goalId: "goal-1" } });
    state = previewReducer(state, { type: "nav/pop" });
    expect(state.nav.stack[1]).toMatchObject({ key: detailKey, params: { goalId: "goal-1", tab: "cash", cashFilter: "invest" } });
    state = previewReducer(state, { type: "nav/pop" });
    expect(state.nav.stack[0]).toMatchObject({ key: listKey, screen: "GoalList", params: { listTab: "history" } });
  });
});
