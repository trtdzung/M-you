import { describe, expect, it } from "vitest";
import { PFM_HUB, REPORT_ANCHOR, isCopilotIntent, resolveIntentRoute } from "./copilot-nav";

describe("resolveIntentRoute — whitelisted mappings", () => {
  it("maps open-cashflow → Dòng tiền tab (no dock)", () => {
    expect(resolveIntentRoute("open-cashflow")).toBe("/pfm?tab=cashflow");
  });

  it("maps open-hu → Hũ top-level tab", () => {
    expect(resolveIntentRoute("open-hu")).toBe("/pfm?tab=hu");
  });

  it("maps open-transactions → the full transaction feed", () => {
    expect(resolveIntentRoute("open-transactions")).toBe("/transactions");
  });

  it("maps open-report → Dòng tiền with the fixed report anchor", () => {
    expect(resolveIntentRoute("open-report")).toBe(`/pfm?tab=cashflow#${REPORT_ANCHOR}`);
  });

  it("maps open-wealth → Tài sản & Nợ manager", () => {
    expect(resolveIntentRoute("open-wealth")).toBe("/pfm/wealth");
  });

  it("maps open-overview → Tổng quan tab", () => {
    expect(resolveIntentRoute("open-overview")).toBe("/pfm?tab=overview");
  });

  it("maps open-assistant → dedicated chat", () => {
    expect(resolveIntentRoute("open-assistant")).toBe("/assistant");
  });
});

describe("resolveIntentRoute — retired dock params (red-team #12)", () => {
  it("no longer routes to a Hũ/Giao dịch/Báo cáo dock", () => {
    // The docks are gone; nothing resolves to `&dock=`.
    for (const intent of ["open-cashflow", "open-hu", "open-transactions", "open-report"]) {
      expect(resolveIntentRoute(intent)).not.toContain("dock=");
    }
  });
});

describe("resolveIntentRoute — fallbacks", () => {
  it("falls back to the tab hub for an unknown intent", () => {
    expect(resolveIntentRoute("delete-account")).toBe(PFM_HUB);
    expect(resolveIntentRoute("")).toBe(PFM_HUB);
    expect(resolveIntentRoute("open-cashflow&dock=hu")).toBe(PFM_HUB);
  });

  it("falls back for the retired open-plan intent (Kế hoạch tab removed)", () => {
    expect(resolveIntentRoute("open-plan")).toBe(PFM_HUB);
  });
});

describe("isCopilotIntent", () => {
  it("recognizes only whitelisted intent ids", () => {
    expect(isCopilotIntent("open-hu")).toBe(true);
    expect(isCopilotIntent("open-cashflow")).toBe(true);
    expect(isCopilotIntent("nope")).toBe(false);
    expect(isCopilotIntent(null)).toBe(false);
    expect(isCopilotIntent(undefined)).toBe(false);
  });
});
