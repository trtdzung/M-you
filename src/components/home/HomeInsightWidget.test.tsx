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
  metrics: [],
};

const card1: HomeInsight = {
  snapshotId: "a".repeat(64),
  title: "Hũ có thể cạn sớm",
  body: "Hãy cùng xem lại các khoản chi.",
  source: "agent",
  asOf: "2026-09-15",
  category: "CASHFLOW_RISK",
  categoryLabel: "Rủi ro dòng tiền",
  tone: "warning",
  impactLine: "Hũ ăn uống sắp vượt hạn mức.",
  badgeText: "Hũ chi tiêu",
  candidate: {
    id: "spending:jar:food",
    topic: "spending",
    category: "CASHFLOW_RISK",
    categoryLabel: "Rủi ro dòng tiền",
    tone: "warning",
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
  category: "ANOMALY_LEAKAGE",
  categoryLabel: "Bất thường & rò rỉ",
  tone: "info",
  impactLine: "Hoàn tiền đã cộng vào số dư khả dụng.",
  badgeText: "Hoàn tiền",
  candidate: {
    id: "refund:tx_123",
    topic: "spending",
    category: "ANOMALY_LEAKAGE",
    categoryLabel: "Bất thường & rò rỉ",
    tone: "info",
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

const card3: HomeInsight = {
  snapshotId: "a".repeat(64),
  title: "Đạt 50% mục tiêu Mua nhà",
  body: "Mục tiêu mua nhà đã tích luỹ được 50 triệu.",
  source: "fallback",
  asOf: "2026-09-15",
  category: "GOAL_PROGRESS",
  categoryLabel: "Tiến độ mục tiêu",
  tone: "positive",
  impactLine: "Đã đạt 50% kế hoạch, tiếp tục duy trì nhịp tích lũy.",
  badgeText: "Đạt 50%",
  primaryAction: {
    type: "navigate_goals",
    label: "Xem mục tiêu",
    href: "/goals",
  },
  candidate: {
    id: "goal:house",
    topic: "spending",
    category: "GOAL_PROGRESS",
    categoryLabel: "Tiến độ mục tiêu",
    tone: "positive",
    priority: 2,
    severity: "info",
    confidence: "recorded",
    title: "Đạt 50% mục tiêu Mua nhà",
    body: "Mục tiêu mua nhà đã tích luỹ được 50 triệu.",
    metric: { label: "Tiến độ tích lũy", value: 50000000, unit: "VND" },
    facts: {},
    action: "overview",
    question: "Chi tiết tiến độ mục tiêu mua nhà.",
  },
};

const carouselResponse: HomeInsightCarouselResult = {
  snapshotId: "a".repeat(64),
  asOf: "2026-09-15",
  healthScore: mockHealthScore,
  healthAssessment: null,
  insights: [card1, card2, card3],
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

describe("HomeInsightWidget Pure 3-Insight Carousel", () => {
  it("renders 3-slide carousel, displays Proactive Insight on slide 1 and navigates to insight slides 2 & 3", async () => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<HomeInsightWidget />);

    // Slide 1: Insight 1
    const slide1Btn = await screen.findByRole("button", {
      name: new RegExp(card1.title),
    });
    expect(slide1Btn).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText(/Còn lại · Ăn uống:/)).toBeInTheDocument();

    // Navigate to Slide 2 using touch swipe
    const carouselSection = screen.getByRole("region", {
      name: /Gợi ý tài chính/,
    });
    const swipeTrack = carouselSection.querySelector(".touch-pan-y") as HTMLElement;
    fireEvent.touchStart(swipeTrack, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(swipeTrack, { changedTouches: [{ clientX: 100 }] });

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText(card2.title)).toBeInTheDocument();
    expect(screen.getByText(/Tiền hoàn lại:/)).toBeInTheDocument();

    // Navigate to Slide 3 using mouse drag swipe
    fireEvent.mouseDown(swipeTrack, { clientX: 250, button: 0 });
    fireEvent.mouseMove(swipeTrack, { clientX: 100 });
    fireEvent.mouseUp(swipeTrack);

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByText(card3.title)).toBeInTheDocument();
    expect(screen.getByText(/Tiến độ tích lũy:/)).toBeInTheDocument();

    // Verify arrow buttons are absent (swipe only)
    expect(screen.queryByRole("button", { name: "Slide sau" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Slide trước" })).not.toBeInTheDocument();

    // Navigate with Keyboard ArrowLeft
    fireEvent.keyDown(carouselSection, { key: "ArrowLeft" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("opens insight detail sheet with category pill, impactLine, and metric box", async () => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<HomeInsightWidget />);

    const slide1Btn = await screen.findByRole("button", {
      name: new RegExp(card1.title),
    });
    fireEvent.click(slide1Btn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Rủi ro dòng tiền").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Hũ ăn uống sắp vượt hạn mức.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(card1.body)).toBeInTheDocument();
    expect(screen.getAllByText("51,000 VND").length).toBeGreaterThanOrEqual(1);
  });

  it("opens insight detail sheet and passes grounded draft to assistant on chat click", async () => {
    vi.stubGlobal("fetch", vi.fn(respond));
    render(<HomeInsightWidget />);

    const slide1Btn = await screen.findByRole("button", {
      name: new RegExp(card1.title),
    });
    fireEvent.click(slide1Btn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(card1.body)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem cụ thể cùng M-Your" }));
    expect(push).toHaveBeenCalledWith("/pfm?assistant=1&insight=1");

    expect(takeInsightDraft("CIF_0002")).toBeNull();
    const payload = takeInsightDraft(cif);
    expect(payload?.draft).toContain("51,000 VND");
    expect(takeInsightDraft(cif)).toBeNull();
  });

  it("handles dismissing insight card in 24 hours", async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeInsightWidget />);
    const slide1Btn = await screen.findByRole("button", {
      name: new RegExp(card1.title),
    });
    fireEvent.click(slide1Btn);

    const dismissBtn = screen.getByRole("button", { name: "Ẩn gợi ý này trong 24h" });
    expect(dismissBtn).toBeInTheDocument();
    fireEvent.click(dismissBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/proactive-insights/current",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          cif: "CIF_0001",
          snapshotId: card1.snapshotId,
          event: "dismissed",
        }),
      })
    );
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
    expect(await screen.findByRole("button", { name: new RegExp(card1.title) })).toBeInTheDocument();

    // Go to slide 2
    fireEvent.click(screen.getByRole("tab", { name: "Chuyển đến slide 2" }));
    expect(screen.getAllByText("Chưa có gợi ý mới").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("M-Your đang tiếp tục theo dõi tài chính của bạn").length).toBeGreaterThanOrEqual(1);

    // Go to slide 3
    fireEvent.click(screen.getByRole("tab", { name: "Chuyển đến slide 3" }));
    expect(screen.getAllByText("Chưa có gợi ý mới").length).toBeGreaterThanOrEqual(1);
  });

  it("never displays the previous customer's card while loading another", async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<HomeInsightWidget />);
    await screen.findByRole("button", { name: new RegExp(card1.title) });

    cif = "CIF_0002";
    fetchMock.mockImplementation(() => new Promise(() => {}));
    rerender(<HomeInsightWidget />);
    expect(screen.queryByText(card1.title)).not.toBeInTheDocument();
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

  it("renders categoryLabel, impactLine, badgeText and opens HandbookSheet for security action", async () => {
    const securityCard: HomeInsight = {
      snapshotId: "b".repeat(64),
      title: "Cẩm nang bảo vệ tài khoản",
      body: "Bổ sung Người liên hệ khẩn cấp trong Security Hub.",
      source: "fallback",
      asOf: "2026-09-15",
      category: "DISCOVERY_GUIDE",
      categoryLabel: "Khám phá & Bảo mật",
      tone: "security",
      impactLine: "Bổ sung liên hệ khẩn cấp tại Security Hub để bảo vệ tài khoản.",
      badgeText: "Điểm 70/100",
      primaryAction: {
        type: "open_security_handbook",
        label: "Xem cẩm nang bảo mật",
      },
      candidate: {
        id: "security:guide",
        topic: "spending",
        category: "DISCOVERY_GUIDE",
        categoryLabel: "Khám phá & Bảo mật",
        tone: "security",
        priority: 3,
        severity: "info",
        confidence: "recorded",
        title: "Cẩm nang bảo vệ tài khoản",
        body: "Bổ sung Người liên hệ khẩn cấp trong Security Hub.",
        metric: { label: "Điểm bảo mật hiện tại", value: 70, unit: "points" },
        facts: {},
        action: "overview",
        question: "Cẩm nang bảo mật.",
      },
    };

    const customRes: HomeInsightCarouselResult = {
      ...carouselResponse,
      insights: [securityCard],
    };

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => customRes })));
    render(<HomeInsightWidget />);

    // Verify categoryLabel, impactLine, badgeText rendered on Slide 1
    expect(await screen.findByText("Khám phá & Bảo mật")).toBeInTheDocument();
    expect(screen.getByText("Bổ sung liên hệ khẩn cấp tại Security Hub để bảo vệ tài khoản.")).toBeInTheDocument();
    expect(screen.getByText("Điểm 70/100")).toBeInTheDocument();
    expect(screen.getAllByText("70/100 điểm").length).toBeGreaterThanOrEqual(1);

    // Click to open detail sheet
    fireEvent.click(screen.getByRole("button", { name: new RegExp(securityCard.title) }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Click "Xem cẩm nang bảo mật" button
    const handbookBtn = screen.getByRole("button", { name: "Xem cẩm nang bảo mật" });
    expect(handbookBtn).toBeInTheDocument();
    fireEvent.click(handbookBtn);

    // Verify HandbookSheet opened
    expect(await screen.findByText("Giải pháp bảo mật MSB")).toBeInTheDocument();
  });
});
