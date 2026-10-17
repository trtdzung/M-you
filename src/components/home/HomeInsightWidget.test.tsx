import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_NOW } from "@/lib/demo-clock";
import { makeFinancials, makeJarBudgetLine, makeJarBudgetResult } from "@/insights/__tests__/helpers";
import { txn } from "@/domain/engine/__tests__/helpers";
import type { StoredCategory } from "@/domain/models";
import { HomeInsightWidget } from "./HomeInsightWidget";

// ── mocks ─────────────────────────────────────────────────────────────────────

const requestJarInsight = vi.fn();
const requestInvestmentInsight = vi.fn();

vi.mock("@/lib/insight-api", () => ({
  INVESTMENT_PRODUCTS: {
    "m-sinh-loi": {
      id: "m-sinh-loi",
      label: "M – Sinh lời",
      features: ["Tự động sinh lời", "Sinh lời hơn mỗi ngày", "Linh hoạt rút tiền 24/7"],
      ctaLabel: "Xem thêm",
      ctaUrl: "https://www.msb.com.vn/khach-hang-ca-nhan/dau-tu/",
    },
    "tiet-kiem": {
      id: "tiet-kiem",
      label: "Chứng chỉ tiền gửi MSB",
      features: ["Sinh lời đến 6,9%/năm", "Linh hoạt chuyển nhượng", "Giao dịch online an toàn"],
      ctaLabel: "Đăng ký",
      ctaUrl: "https://www.msb.com.vn/khach-hang-ca-nhan/dau-tu/",
    },
  },
  jarInsightSnapshot: () => "jar-snap-1",
  investmentFeaturesSnapshot: () => "invest-snap-1",
  requestJarInsight: (...args: unknown[]) => requestJarInsight(...args),
  requestInvestmentInsight: (...args: unknown[]) => requestInvestmentInsight(...args),
}));

// ── fixtures ──────────────────────────────────────────────────────────────────

const categories: StoredCategory[] = [
  { id: "dining", label: "Ăn uống", kind: "expense", fixed: false },
];

const transactions = ["10", "11", "12"].map((day) =>
  txn({ categoryId: "dining", amount: 100_000, postedAt: `2026-09-${day}T00:00:00.000Z` }),
);

/** Jar remaining controls burn-risk trigger; unallocated controls investment trigger. */
function financials(remaining: number, unallocated: number | "unknown" = 0) {
  return makeFinancials({
    monthKey: "2026-09",
    unallocatedPool:
      unallocated === "unknown"
        ? { amount: "unknown", overAllocated: false, source: "mock" }
        : { amount: unallocated, overAllocated: unallocated < 0, source: "mock" },
    jarBudget: makeJarBudgetResult({
      lines: [
        makeJarBudgetLine({
          huId: "food",
          label: "Ăn uống",
          categoryIds: ["dining"],
          limit: 500_000,
          limitState: "set",
          remaining,
        }),
      ],
      summary: {
        totalLimit: 500_000,
        totalSpent: 300_000,
        totalSpentSet: 300_000,
        totalRebalanceNet: 0,
        totalRemaining: remaining,
        pctUsed: 0.6,
        daysLeft: 10,
        setCount: 1,
        unsetCount: 0,
      },
      meta: {
        period: { from: "2026-08-31T17:00:00.000Z", to: "2026-09-30T16:59:59.999Z", label: "09/2026" },
        sourceCoverage: { sources: ["mock"], knownCount: 3, unknownCount: 0 },
        freshness: DEMO_NOW.toISOString(),
      },
    }),
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("HomeInsightWidget", () => {
  beforeEach(() => {
    requestJarInsight.mockReset();
    requestInvestmentInsight.mockReset();
  });

  // ── Priority 1: jar-burn warning ───────────────────────────────────────────

  describe("jar-burn warning (priority 1)", () => {
    it("shows deterministic numbers immediately while agent is pending", async () => {
      requestJarInsight.mockResolvedValue({
        snapshot_id: "jar-snap-1",
        explanation: "Chi tiêu ăn uống đang tăng nhanh.",
        suggested_action: "Xem lại giao dịch gần đây.",
      });
      render(
        <HomeInsightWidget
          financials={financials(200_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      // Deterministic numbers shown immediately
      expect(screen.getByText(/Hũ Ăn uống có thể hết/)).toBeInTheDocument();
      expect(screen.getByText(/20K\/ngày/)).toBeInTheDocument();
      // Agent narrative arrives asynchronously
      await waitFor(() => expect(requestJarInsight).toHaveBeenCalledTimes(1));
      expect(
        await screen.findByText("Chi tiêu ăn uống đang tăng nhanh."),
      ).toBeInTheDocument();
    });

    it("uses fallback explanation when agent is unavailable", async () => {
      requestJarInsight.mockRejectedValue(new Error("offline"));
      render(
        <HomeInsightWidget
          financials={financials(200_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      await waitFor(() => expect(requestJarInsight).toHaveBeenCalledTimes(1));
      // Fallback text (not agent prose)
      expect(
        screen.getByText(/Ước tính từ chi tiêu linh hoạt/),
      ).toBeInTheDocument();
    });

    it("does not show investment nudge when burn risk is present", () => {
      requestJarInsight.mockReturnValue(new Promise(() => {})); // pending, never resolves
      render(
        <HomeInsightWidget
          financials={financials(200_000, 5_000_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(screen.getByText(/Hũ Ăn uống có thể hết/)).toBeInTheDocument();
      expect(screen.queryByText(/Gợi ý đầu tư/)).not.toBeInTheDocument();
      expect(requestInvestmentInsight).not.toHaveBeenCalled();
    });
  });

  // ── Priority 2: investment nudge ───────────────────────────────────────────

  describe("investment nudge (priority 2)", () => {
    it("calls requestInvestmentInsight with extracted features when surplus > 0", async () => {
      requestInvestmentInsight.mockResolvedValue({
        snapshot_id: "invest-snap-1",
        product_id: "m-sinh-loi",
        explanation: "Số tiền nhàn rỗi của bạn chưa được tận dụng.",
        suggested_action: "Kích hoạt M–Sinh lời để sinh lời tự động.",
      });
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, 2_000_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(screen.getByTestId("home-insight-widget")).toHaveTextContent("Gợi ý đầu tư");
      await waitFor(() => expect(requestInvestmentInsight).toHaveBeenCalledTimes(1));
      // Verify features object is passed (not a hardcoded product choice)
      const [passedCif, passedFeatures] = requestInvestmentInsight.mock.calls[0];
      expect(passedCif).toBe("CIF_0001");
      expect(passedFeatures).toHaveProperty("unallocated_balance");
      expect(passedFeatures).toHaveProperty("income_this_month");
      expect(passedFeatures).toHaveProperty("savings_rate");
      expect(passedFeatures).toHaveProperty("runway_months");
      expect(passedFeatures).toHaveProperty("net_worth");
      expect(passedFeatures).toHaveProperty("goal_count");
    });

    it("renders the product card from agent product_id (m-sinh-loi)", async () => {
      requestInvestmentInsight.mockResolvedValue({
        snapshot_id: "invest-snap-1",
        product_id: "m-sinh-loi",
        explanation: "Số tiền nhàn rỗi của bạn chưa được tận dụng.",
        suggested_action: "Kích hoạt M–Sinh lời để sinh lời tự động.",
      });
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, 2_000_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(await screen.findByText("M – Sinh lời")).toBeInTheDocument();
      expect(screen.getByText("Tự động sinh lời")).toBeInTheDocument();
      expect(screen.getByText("Sinh lời hơn mỗi ngày")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Xem thêm/ })).toHaveAttribute(
        "href",
        "https://www.msb.com.vn/khach-hang-ca-nhan/dau-tu/",
      );
    });

    it("renders the product card from agent product_id (tiet-kiem)", async () => {
      requestInvestmentInsight.mockResolvedValue({
        snapshot_id: "invest-snap-1",
        product_id: "tiet-kiem",
        explanation: "Bạn có thể hưởng lãi suất cao hơn với sản phẩm kỳ hạn.",
        suggested_action: "Đăng ký chứng chỉ tiền gửi MSB để tối ưu lợi nhuận.",
      });
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, 2_000_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(await screen.findByText("Chứng chỉ tiền gửi MSB")).toBeInTheDocument();
      expect(screen.getByText("Sinh lời đến 6,9%/năm")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Đăng ký/ })).toBeInTheDocument();
    });

    it("shows only explanation when agent returns product_id: null", async () => {
      requestInvestmentInsight.mockResolvedValue({
        snapshot_id: "invest-snap-1",
        product_id: null,
        explanation: "Tài chính của bạn đang ổn định, tiếp tục duy trì nhé.",
        suggested_action: "Theo dõi chi tiêu thường xuyên để giữ sức khoẻ tài chính.",
      });
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, 2_000_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Tài chính của bạn đang ổn định, tiếp tục duy trì nhé.")).toBeInTheDocument(),
      );
      // No product card
      expect(screen.queryByText("M – Sinh lời")).not.toBeInTheDocument();
      expect(screen.queryByText("Chứng chỉ tiền gửi MSB")).not.toBeInTheDocument();
    });

    it("shows pending message while agent is loading", () => {
      // Never resolves within this test
      requestInvestmentInsight.mockReturnValue(new Promise(() => {}));
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, 2_000_000)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(screen.getByText(/M-Your đang phân tích/)).toBeInTheDocument();
    });

    it("does not call the investment agent when unallocated pool is zero or negative", () => {
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, 0)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(requestInvestmentInsight).not.toHaveBeenCalled();
    });

    it("does not call the investment agent when pool is unknown", () => {
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, "unknown")}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(requestInvestmentInsight).not.toHaveBeenCalled();
    });
  });

  // ── Priority 3: monitoring fallback ───────────────────────────────────────

  describe("monitoring fallback (priority 3)", () => {
    it("shows fallback when no burn risk and no surplus", () => {
      render(
        <HomeInsightWidget
          financials={financials(1_000_000, 0)}
          transactions={transactions}
          categories={categories}
          cif="CIF_0001"
        />,
      );
      expect(screen.getByTestId("home-insight-widget")).toHaveTextContent(
        "Chưa có cảnh báo hũ sắp cạn",
      );
      expect(requestJarInsight).not.toHaveBeenCalled();
      expect(requestInvestmentInsight).not.toHaveBeenCalled();
    });
  });
});
