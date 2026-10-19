import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type {
  HomeInsight,
  HomeInsightCarouselResult,
} from "@/insights/proactive/home-contract";
import type { FinancialHealthScoreResult } from "@/domain/models/health-score";
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

const mockHealthScore: FinancialHealthScoreResult = {
  computedAt: "2026-09-15T00:00:00Z",
  policyVersion: "pfm-health-v0",
  overallScore: 88,
  tier: "healthy",
  scoreCoverage: 0.625,
  availablePillars: ["SPEND", "SAVE", "BORROW", "PLAN_PROTECT"],
  pillarScores: { SPEND: 100, SAVE: 100, BORROW: 100, PLAN_PROTECT: 50 },
  metrics: [
    {
      id: "SPENDING_TO_INCOME",
      pillar: "SPEND",
      score: 100,
      weight: 0.125,
      rawValue: 0.67,
      rawUnit: "ratio",
      source: "msb",
      period: "2026-09",
      asOf: "2026-09-15",
      assumptions: [],
    },
    {
      id: "INSURANCE_COVERAGE",
      pillar: "PLAN_PROTECT",
      score: null,
      weight: 0.125,
      rawValue: null,
      rawUnit: "boolean",
      source: "self_reported",
      period: "2026-09",
      asOf: "2026-09-15",
      reasonUnavailable: "Chưa ghi nhận hợp đồng bảo hiểm",
      assumptions: [],
    },
  ],
};

const card1: HomeInsight = {
  snapshotId: "a".repeat(64),
  title: "Hũ có thể cạn sớm",
  body: "Hãy cùng xem lại các khoản chi.",
  source: "agent",
  asOf: "2026-09-15",
  candidate: {
    id: "spending:jar:food",
    topic: "spending",
    priority: 1,
    severity: "attention",
    confidence: "estimated",
    title: "Hũ có thể cạn sớm",
    body: "Xem lại chi tiêu.",
    metric: { label: "Còn lại · Ăn uống", value: 51000, unit: "VND" },
    facts: { remaining: 51000 },
    action: "chat",
    question: "Giúp tôi xem lại chi tiêu hũ ăn uống.",
  },
};

const card2: HomeInsight = {
  snapshotId: "a".repeat(64),
  title: "Đã nhận hoàn tiền",
  body: "Khoản hoàn tiền 150.000 đ đã về tài khoản.",
  source: "fallback",
  asOf: "2026-09-15",
  candidate: {
    id: "refund:tx_123",
    topic: "spending",
    priority: 3,
    severity: "info",
    confidence: "recorded",
    title: "Đã nhận hoàn tiền",
    body: "Khoản hoàn tiền 150.000 đ đã về tài khoản.",
    metric: { label: "Tiền hoàn lại", value: 150000, unit: "VND" },
    facts: { amount: 150000 },
    action: "overview",
    question: "Chi tiết hoàn tiền thế nào?",
  },
};

const carouselResponse: HomeInsightCarouselResult = {
  snapshotId: "a".repeat(64),
  asOf: "2026-09-15",
  healthScore: mockHealthScore,
  healthAssessment: {
    snapshotId: "a".repeat(64),
    source: "agent",
    summary: "Tình hình tài chính tổng thể của bạn rất lành mạnh.",
    pillarAssessments: [
      { pillar: "SPEND", status: "strength", explanation: "Dòng tiền chi tiêu ổn định." },
    ],
    strengths: ["Dòng tiền ròng dương"],
    areasToWatch: ["Chưa có hợp đồng bảo vệ"],
    recommendedActions: ["Tham khảo các gói bảo vệ phù hợp"],
    dataLimitations: ["Độ phủ dữ liệu đạt 63%"],
  },
  insights: [card1, card2],
  insight: card1,
  cached: false,
};

const respond = async (_url: unknown, options?: RequestInit) => ({
  ok: true,
  json: async () =>
    JSON.parse(options?.body as string).event
      ? { recorded: true }
      : carouselResponse,
});

beforeEach(() => {
  cif = "CIF_0001";
  push.mockClear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("HomeInsightWidget Carousel & Health Score", () => {
  it("renders 3-slide carousel, displays Health Score on slide 1 and navigates to insight slides", async () => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<HomeInsightWidget />);

    // Slide 1: Health score
    const healthBtn = await screen.findByRole("button", {
      name: /Xem chi tiết Sức khỏe tài chính: 88 điểm/,
    });
    expect(healthBtn).toBeInTheDocument();
    expect(screen.getByText("88 / 100")).toBeInTheDocument();
    expect(screen.getByText(/Độ phủ dữ liệu 63%/)).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    // Navigate to Slide 2 using touch swipe
    const carouselSection = screen.getByRole("region", {
      name: "Gợi ý tài chính và Sức khỏe tài chính",
    });
    const swipeTrack = carouselSection.querySelector(".touch-pan-y") as HTMLElement;
    fireEvent.touchStart(swipeTrack, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(swipeTrack, { changedTouches: [{ clientX: 100 }] });

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText(card1.title)).toBeInTheDocument();
    expect(screen.getByText(/Còn lại · Ăn uống:/)).toBeInTheDocument();

    // Navigate to Slide 3 using mouse drag swipe
    fireEvent.mouseDown(swipeTrack, { clientX: 250, button: 0 });
    fireEvent.mouseMove(swipeTrack, { clientX: 100 });
    fireEvent.mouseUp(swipeTrack);

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByText(card2.title)).toBeInTheDocument();
    expect(screen.getByText(/Tiền hoàn lại:/)).toBeInTheDocument();

    // Verify arrow buttons are absent (swipe only)
    expect(screen.queryByRole("button", { name: "Slide sau" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Slide trước" })).not.toBeInTheDocument();

    // Navigate with Keyboard ArrowLeft
    fireEvent.keyDown(carouselSection, { key: "ArrowLeft" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("opens Health Score sheet with metric breakdown, coverage explanation, and agent assessment", async () => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<HomeInsightWidget />);

    const healthBtn = await screen.findByRole("button", {
      name: /Xem chi tiết Sức khỏe tài chính: 88 điểm/,
    });
    fireEvent.click(healthBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Lành mạnh")).toBeInTheDocument();
    expect(screen.getByText(/Độ phủ dữ liệu: 63%/)).toBeInTheDocument();
    expect(
      screen.getByText(/Đây là tỷ lệ các chỉ số có đủ dữ liệu để tính toán, không phải độ tin cậy/)
    ).toBeInTheDocument();

    // Metrics breakdown
    expect(screen.getByText("Tỷ lệ chi tiêu trên thu nhập")).toBeInTheDocument();
    expect(screen.getByText("Chưa ghi nhận hợp đồng bảo hiểm")).toBeInTheDocument();

    // Agent assessment
    expect(screen.getByText("Tình hình tài chính tổng thể của bạn rất lành mạnh.")).toBeInTheDocument();
    expect(screen.getByText("Dòng tiền ròng dương")).toBeInTheDocument();
    expect(screen.getByText("Chưa có hợp đồng bảo vệ")).toBeInTheDocument();
  });

  it("opens insight detail sheet and passes grounded draft to assistant on chat click", async () => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<HomeInsightWidget />);

    // Go to slide 2 (insight 1)
    fireEvent.click(await screen.findByRole("tab", { name: "Chuyển đến slide 2" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(card1.title) }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(card1.body)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem cụ thể cùng M-Your" }));
    expect(push).toHaveBeenCalledWith("/pfm?assistant=1&insight=1");

    expect(takeInsightDraft("CIF_0002")).toBeNull();
    const payload = takeInsightDraft(cif);
    expect(payload?.draft).toContain("51,000 VND");
    expect(takeInsightDraft(cif)).toBeNull();
  });

  it("handles honest insufficient-data state when overallScore is null", async () => {
    const insufficientScore: FinancialHealthScoreResult = {
      ...mockHealthScore,
      overallScore: null,
      tier: null,
      scoreCoverage: 0.375,
    };
    const mockRes: HomeInsightCarouselResult = {
      ...carouselResponse,
      healthScore: insufficientScore,
      healthAssessment: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => mockRes }))
    );

    render(<HomeInsightWidget />);
    const healthBtn = await screen.findByRole("button", {
      name: /Xem chi tiết Sức khỏe tài chính: Chưa đủ dữ liệu/,
    });
    expect(healthBtn).toBeInTheDocument();
    expect(screen.getByText("Chưa đủ dữ liệu")).toBeInTheDocument();

    fireEvent.click(healthBtn);
    expect(screen.getByText(/Cần tối thiểu 3\/4 trụ cột và 5\/8 chỉ số/)).toBeInTheDocument();
    expect(screen.getByText(/Đánh giá từ trợ lý tài chính hiện chưa sẵn sàng/)).toBeInTheDocument();
  });

  it("handles empty candidate slot gracefully without duplicating candidates", async () => {
    const singleInsightRes: HomeInsightCarouselResult = {
      ...carouselResponse,
      insights: [card1],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => singleInsightRes }))
    );

    render(<HomeInsightWidget />);
    const tab2 = await screen.findByRole("tab", { name: "Chuyển đến slide 2" });

    // Go to slide 2
    fireEvent.click(tab2);
    expect(screen.getByText(card1.title)).toBeInTheDocument();

    // Go to slide 3
    fireEvent.click(screen.getByRole("tab", { name: "Chuyển đến slide 3" }));
    expect(screen.getByText("Chưa có gợi ý mới")).toBeInTheDocument();
    expect(screen.getByText("M-Your đang tiếp tục theo dõi tài chính của bạn")).toBeInTheDocument();
  });

  it("never displays the previous customer's card while loading another", async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<HomeInsightWidget />);
    await screen.findByRole("button", { name: /Sức khỏe tài chính/ });

    cif = "CIF_0002";
    fetchMock.mockImplementation(() => new Promise(() => {}));
    rerender(<HomeInsightWidget />);
    expect(screen.queryByRole("button", { name: /Sức khỏe tài chính: 88/ })).not.toBeInTheDocument();
  });

  it("offers retry on API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error();
      })
    );
    render(<HomeInsightWidget />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    fireEvent.click(screen.getByRole("button", { name: /Gợi ý tài chính/ }));
    expect(await screen.findByRole("button", { name: /Thử lại/ })).toBeInTheDocument();
  });
});
