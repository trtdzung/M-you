import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { setConsent } from "@/lib/consent";
import { ChatPanel } from "../ChatPanel";
import type { AssistantEvent } from "@/ai/pipeline/events";

// Mock the network stream: emit a scripted sequence of events.
const script: AssistantEvent[] = [
  { type: "tool", name: "getMonthlyCashflow", sources: ["Dòng tiền T9/2026 — từ giao dịch."], period: "09/2026" },
  { type: "text", delta: "Thu nhập của bạn là 25.000.000 ₫." },
  {
    type: "chart",
    chart: {
      kind: "goal",
      title: "Dự phóng mục tiêu: Quỹ dự phòng",
      series: [{ month: "2026-09", value: 50 }, { month: "2026-10", value: 60 }],
      markerMonth: "2026-10",
      summary: "Đạt mục tiêu sau ~1 tháng.",
    },
  },
  { type: "done" },
];

vi.mock("@/lib/assistant-stream", () => ({
  streamAssistant: vi.fn(async (_req: unknown, onEvent: (e: AssistantEvent) => void) => {
    for (const e of script) onEvent(e);
  }),
}));

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver (absent in jsdom).
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  window.localStorage.clear();
  setConsent(); // grant the AI scope so the panel is interactive (not the no-scope state)
});

function renderPanel() {
  // Full provider stack mirrors AppProviders: the empty state embeds
  // <InsightsView/>, which reaches useFinancials → corrections/jars/assets/goals.
  return render(
    <PersonaProvider>
      <CorrectionsProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <AssetLiabilityProvider>
            <GoalProvider>
              <PeriodProvider>
                <ChatPanel />
              </PeriodProvider>
            </GoalProvider>
          </AssetLiabilityProvider>
        </JarConfigProvider>
        </ManualTxnsProvider>
    </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("ChatPanel", () => {
  it("shows starters in the empty state", () => {
    renderPanel();
    expect(screen.getByText("Giải thích tháng này")).toBeInTheDocument();
  });

  it("shows the no-scope state and disables the composer when AI consent is missing", async () => {
    window.localStorage.clear();
    setConsent(["transactions"]); // no "ai" scope
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Chưa cấp quyền cho trợ lý")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Gửi")).toBeDisabled();
  });

  it("streams an answer with source chips and a what-if chart", async () => {
    renderPanel();
    const input = screen.getByPlaceholderText(/Hỏi bất kỳ điều gì/i);
    fireEvent.change(input, { target: { value: "Giải thích tháng này" } });
    fireEvent.click(screen.getByLabelText("Gửi"));

    await waitFor(() => {
      expect(screen.getByText(/Thu nhập của bạn là 25\.000\.000/)).toBeInTheDocument();
    });
    // User bubble echoes the question.
    expect(screen.getAllByText("Giải thích tháng này").length).toBeGreaterThan(0);
    // Source chips summarised.
    expect(screen.getByText(/1 nguồn dữ liệu/)).toBeInTheDocument();
    // What-if chart title present.
    expect(screen.getByText(/Dự phóng mục tiêu/)).toBeInTheDocument();
  });
});
