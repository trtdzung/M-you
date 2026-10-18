import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Intervention } from "@/lib/security/intervention-types";

const state = vi.hoisted(() => ({ items: [] as Intervention[], shown: vi.fn(), respond: vi.fn().mockResolvedValue(null) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/transfer" }));
vi.mock("../useInterventions", () => ({ useInterventions: () => state }));
vi.mock("../useRecovery", () => ({ useRecovery: () => ({ steps: [true, false, false, false] }) }));
vi.mock("../HandbookSheet", () => ({ HandbookSheet: () => null }));
vi.mock("@/components/primitives", () => ({ Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div role="dialog">{children}</div> : null }));
import { InterventionHost } from "../InterventionHost";
const notice = (patch: Partial<Intervention> = {}): Intervention => ({ id: "notice-1", scenario: "BT4", scenarios: ["BT4"], level: "green", surface: "tooltip", target: "txn:credit-1", status: "pending", copy: { message: "Khoản nhận từ người lạ", question: null, chips: ["Tôi biết người này"], emphasis: [] }, source: "rule", agentStatus: "off", countdownSec: null, classify: false, evidence: [], createdAt: 0, choice: null, ...patch });
beforeEach(() => { state.items = [notice()]; vi.clearAllMocks(); });
afterEach(() => { cleanup(); document.body.innerHTML = ""; });
describe("Scam Shield context and response preservation", () => {
  it("does not float a transaction notice on a screen without that transaction", () => {
    render(<InterventionHost />);
    expect(screen.queryByTestId("shield-tooltip")).not.toBeInTheDocument();
    expect(state.shown).not.toHaveBeenCalled();
  });
  it("renders within its transaction slot and sends the exact existing choice", () => {
    const slot = document.createElement("div"); slot.dataset.shieldSlot = "txn:credit-1"; document.body.append(slot);
    render(<InterventionHost />);
    expect(slot).toContainElement(screen.getByTestId("shield-tooltip"));
    fireEvent.click(screen.getByRole("button", { name: "Tôi biết người này" }));
    expect(state.respond).toHaveBeenCalledWith("notice-1", "Tôi biết người này");
  });
  it("does not save trust until the user confirms; then preserves the engine choice", () => {
    state.items = [notice({ scenario: "BT6", target: "transfer-success", copy: { message: "Lưu người nhận", question: null, chips: ["Lưu vào danh bạ tin cậy"], emphasis: [] } })];
    const slot = document.createElement("div"); slot.dataset.shieldSlot = "transfer-success"; document.body.append(slot);
    render(<InterventionHost />);
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào danh bạ tin cậy" }));
    expect(state.respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận lưu" }));
    expect(state.respond).toHaveBeenCalledWith("notice-1", "Lưu vào danh bạ tin cậy");
  });
});
