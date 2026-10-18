import { describe, expect, it } from "vitest";
import { withPfmTab } from "../PfmTabs";

describe("withPfmTab", () => {
  it("drops the hũ editor param when leaving settings", () => {
    const current = new URLSearchParams("tab=settings&hu=food&dock=hu&setup=1");
    expect(withPfmTab(current, "budget")).toBe("tab=budget");
  });

  it("keeps hu while staying on the settings tab", () => {
    const current = new URLSearchParams("tab=settings&hu=food");
    expect(withPfmTab(current, "settings")).toBe("tab=settings&hu=food");
  });
});
