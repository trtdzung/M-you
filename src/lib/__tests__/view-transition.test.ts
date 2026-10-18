import { describe, expect, it, vi, afterEach } from "vitest";
import { isNavigationTransitionPending, navigateWithTransition, notifyNavigationCommitted } from "../view-transition";

afterEach(() => {
  notifyNavigationCommitted();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-vt-dir");
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("navigateWithTransition", () => {
  it("navigates immediately when the browser cannot animate", () => {
    const go = vi.fn();
    navigateWithTransition(go, "forward");
    expect(go).toHaveBeenCalledOnce();
    expect(isNavigationTransitionPending()).toBe(false);
  });

  it("ignores a second navigation until the first route commits", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    let update: Promise<void> | undefined;
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (cb: () => Promise<void>) => {
        update = cb();
        return { skipTransition() {}, finished: new Promise<void>(() => {}) };
      },
    });

    const first = vi.fn();
    const second = vi.fn();
    navigateWithTransition(first, "forward");
    navigateWithTransition(second, "back");

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.vtDir).toBe("forward");
    expect(isNavigationTransitionPending()).toBe(true);

    notifyNavigationCommitted();
    return update?.then(() => {
      expect(isNavigationTransitionPending()).toBe(false);
    });
  });
});
