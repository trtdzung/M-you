import { describe, expect, it } from "vitest";
import { edgeBackHref, navigationDirection } from "../navigation-direction";

describe("navigationDirection", () => {
  it("crossfades home tabs and keeps query-only tab changes instant", () => {
    expect(navigationDirection("/", "/accounts")).toBe("fade");
    expect(navigationDirection("/accounts", "/settings")).toBe("fade");
    expect(navigationDirection("/accounts", "/transactions")).toBe("fade");
    expect(navigationDirection("/settings", "/")).toBe("fade");
    expect(navigationDirection("/pfm?tab=overview", "/pfm?tab=budget")).toBe("none");
  });

  it("slides into a screen and back out the way the header does", () => {
    expect(navigationDirection("/", "/transfer")).toBe("forward");
    expect(navigationDirection("/transfer", "/transfer-confirm?draftId=1")).toBe("forward");
    expect(navigationDirection("/transfer-confirm", "/")).toBe("back");
    expect(navigationDirection("/", "/pfm")).toBe("forward");
    expect(navigationDirection("/pfm", "/")).toBe("back");
    expect(navigationDirection("/pfm?tab=goals", "/goals/abc")).toBe("forward");
    expect(navigationDirection("/goals/abc", "/pfm?tab=goals")).toBe("back");
    expect(navigationDirection("/goals/new", "/pfm?tab=goals")).toBe("back");
    expect(navigationDirection("/accounts", "/accounts/acc-1")).toBe("forward");
    expect(navigationDirection("/accounts/acc-1", "/accounts")).toBe("back");
    expect(navigationDirection("/settings", "/settings/security")).toBe("forward");
    expect(navigationDirection("/settings/security", "/settings/pin")).toBe("forward");
    expect(navigationDirection("/settings/pin", "/settings/security")).toBe("back");
    expect(navigationDirection("/settings/questions", "/settings/advanced")).toBe("back");
    expect(navigationDirection("/settings/security", "/settings")).toBe("back");
  });
});

describe("edgeBackHref", () => {
  it("matches each pushed screen's back control and ignores root tabs", () => {
    expect(edgeBackHref("/")).toBeNull();
    expect(edgeBackHref("/accounts")).toBeNull();
    expect(edgeBackHref("/settings")).toBeNull();
    expect(edgeBackHref("/pfm")).toBeNull();
    expect(edgeBackHref("/settings/pin")).toBe("/settings/security");
    expect(edgeBackHref("/settings/profile")).toBe("/settings");
    expect(edgeBackHref("/accounts/acc-1")).toBe("/accounts");
    expect(edgeBackHref("/goals/abc")).toBe("/pfm?tab=goals");
    expect(edgeBackHref("/transfer")).toBe("history");
    expect(edgeBackHref("/transfer-confirm")).toBe("history");
    expect(edgeBackHref("/pfm/wealth")).toBe("/");
  });
});
