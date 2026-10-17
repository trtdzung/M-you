import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HomeInsight } from "@/insights/proactive/home-contract";
import { takeInsightDraft } from "@/insights/proactive/chat-handoff";

let cif = "CIF_0001";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/providers/context", () => ({ usePersona: () => ({ persona: { cif } }) }));
vi.mock("@/state/assets", () => ({ useAssetLiabilities: () => ({ assets: [], liabilities: [], ready: true, dropped: 0 }) }));
vi.mock("@/state/goals", () => ({ useGoals: () => ({ goals: [], ready: true, dropped: 0 }) }));
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config: {}, loaded: true }) }));
vi.mock("@/state/corrections", () => ({ useCorrections: () => ({ corrections: {}, loaded: true, unsaved: false }) }));
vi.mock("@/state/manual-txns", () => ({ useManualTxns: () => ({ manualTxns: [] }) }));
import { HomeInsightWidget } from "./HomeInsightWidget";
const card: HomeInsight = { snapshotId: "a".repeat(64), title: "Hũ có thể cạn sớm", body: "Hãy cùng xem lại các khoản chi.",
  source: "agent", asOf: "2026-09-15", candidate: { id: "spending:jar:food", topic: "spending", priority: 1,
    severity: "attention", confidence: "estimated", title: "Hũ có thể cạn sớm", body: "Xem lại chi tiêu.",
    metric: { label: "Còn lại · Ăn uống", value: 51000, unit: "VND" }, facts: { remaining: 51000 },
    action: "chat", question: "Giúp tôi xem lại chi tiêu hũ ăn uống." } };
const respond = async (_url: unknown, options?: RequestInit) => ({ ok: true,
  json: async () => JSON.parse(options?.body as string).event ? { recorded: true } : { insight: card, cached: false } });
beforeEach(() => { cif = "CIF_0001"; push.mockClear(); sessionStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe("Home insight notification", () => {
  it("stays compact, opens a sheet, and passes grounded draft only to the current persona", async () => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<HomeInsightWidget />);
    fireEvent.click(await screen.findByRole("button", { name: /Xem insight/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(card.body)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem cụ thể cùng M-Your" }));
    expect(push).toHaveBeenCalledWith("/pfm?assistant=1&insight=1");
    expect(takeInsightDraft("CIF_0002")).toBeNull();
    const payload = takeInsightDraft(cif);
    expect(payload?.draft).toContain("51.000");
    expect(takeInsightDraft(cif)).toBeNull();
  });
  it("sends no session topups — jar deposits are persisted in jar_ledger and read server-side", async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal("fetch", fetchMock);
    render(<HomeInsightWidget />);
    await screen.findByRole("button", { name: /Xem insight/ });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).not.toHaveProperty("topups");
  });
  it("never displays the previous customer's card while loading another", async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<HomeInsightWidget />);
    await screen.findByRole("button", { name: /Xem insight/ });
    cif = "CIF_0002";
    fetchMock.mockImplementation(() => new Promise(() => {}));
    rerender(<HomeInsightWidget />);
    expect(screen.queryByRole("button", { name: /Xem insight/ })).not.toBeInTheDocument();
  });
  it("offers retry on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(); }));
    render(<HomeInsightWidget />);
    expect(await screen.findByRole("button", { name: /Thử lại/ })).toBeInTheDocument();
  });
});
