import type { Scenario, WorldState } from "../model/state";
import { buildWorld } from "./builder";
import { FUND_BOND, FUND_EQUITY, LOAN_CAR, ONLINE_DEPOSIT } from "./products";

/**
 * 13 scripted scenarios + demo (mixed) + empty. Each `build()` returns a fresh
 * world; the sim date is 16/10/2026 everywhere. Goal ids are deterministic
 * per scenario (goal-1001, …) — use `firstGoalId(world)` instead of hardcoding.
 */

const TR = 1_000_000;

export function firstGoalId(world: WorldState): string | undefined {
  return world.goals[0]?.id;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "demo",
    code: "0",
    title: "Tổng hợp (mặc định)",
    description: "Ba mục tiêu ở ba trạng thái: sắp mua xe, du lịch có tiền nhàn rỗi, và một quỹ dự phòng đã hoàn thành.",
    highlights: ["Danh sách mục tiêu + tab Lịch sử", "Gợi ý đầu tư tiền nhàn rỗi", "Tiến độ Tiền / Tài sản"],
    jumpTo: { screen: "GoalList" },
    build: () =>
      buildWorld({
        scenarioId: "demo",
        customer: { monthlyIncome: 45 * TR, monthlySurplus: 25 * TR, mainCasaBalance: 48 * TR, riskProfile: "balanced" },
        goals: [
          {
            name: "Mua Mazda CX-5",
            template: "car",
            target: 850 * TR,
            createdAt: "2024-11-20",
            targetDate: "2026-12-31",
            opening: 200 * TR,
            monthly: 26 * TR,
            dayOfMonth: 6,
            flexibility: "date_flexible",
          },
          {
            name: "Du lịch châu Âu cả nhà",
            template: "travel",
            target: 350 * TR,
            createdAt: "2025-12-01",
            targetDate: "2030-06-30",
            opening: 120 * TR,
            monthly: 5 * TR,
            dayOfMonth: 12,
            assets: [{ type: "liquid", category: "fund", productId: FUND_BOND.id, amount: 20 * TR, createdAt: "2026-05-15" }],
          },
          {
            name: "Quỹ dự phòng 6 tháng",
            template: "emergency",
            target: 120 * TR,
            createdAt: "2024-06-01",
            targetDate: "2026-03-31",
            status: "completed",
            completedAt: "2026-03-31",
            opening: 30 * TR,
            monthly: 4.5 * TR,
            dayOfMonth: 2,
            flexibility: "amount_flexible",
            accountClosed: true,
            extraTxns: [{ kind: "withdraw", amount: "all", date: "2026-03-31", note: "Hoàn thành — chuyển về tài khoản chính" }],
          },
        ],
      }),
  },
  {
    id: "s01-car-feasible",
    code: "1",
    title: "Mua xe — khả thi, sắp hoàn thành",
    description: "Đã tích luỹ ~94%. Còn 2 lần trích tự động là đủ trước hạn 31/12/2026.",
    highlights: ["Tiến độ gần 100%", "Tua 2 tháng → đạt trước hạn / hoàn thành"],
    jumpTo: { screen: "GoalDetail", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s01-car-feasible",
        customer: { monthlyIncome: 45 * TR, monthlySurplus: 28 * TR, mainCasaBalance: 60 * TR },
        goals: [
          {
            name: "Mua Mazda CX-5",
            template: "car",
            target: 850 * TR,
            createdAt: "2024-11-20",
            targetDate: "2026-12-31",
            opening: 200 * TR,
            monthly: 26 * TR,
            dayOfMonth: 6,
          },
        ],
      }),
  },
  {
    id: "s02-house-loan",
    code: "2",
    title: "Mua nhà — thiếu tiền, cần vay",
    description: "Còn 9 tháng nhưng thiếu gần 1,7 tỷ. Các phương án: tiết kiệm thêm, lùi ngày, giảm mục tiêu, vay (cuối cùng).",
    highlights: ["So sánh phương án", "Vay mua nhà trong khả năng trả (≤ 40% thu nhập)"],
    jumpTo: { screen: "OptionsCompare", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s02-house-loan",
        customer: { monthlyIncome: 60 * TR, monthlySurplus: 30 * TR, mainCasaBalance: 80 * TR },
        goals: [
          {
            name: "Căn hộ 2PN Thủ Đức",
            template: "house",
            target: 3_200 * TR,
            createdAt: "2025-01-10",
            targetDate: "2027-06-30",
            opening: 600 * TR,
            monthly: 30 * TR,
            dayOfMonth: 11,
            flexibility: "date_fixed",
          },
        ],
      }),
  },
  {
    id: "s03-travel-idle",
    code: "3",
    title: "Du lịch — tiền nhàn rỗi, gợi ý đầu tư",
    description: "Còn hơn 3 năm, tài khoản mục tiêu để không ~125 triệu. Đang giữ chứng chỉ quỹ cổ phiếu bị giảm giá.",
    highlights: ["Gợi ý tiền gửi / quỹ theo thời gian còn lại", "Quỹ giảm giá ~10% — cảnh báo rủi ro", "Thử chỉnh giá quỹ ±%"],
    jumpTo: { screen: "InvestSuggest", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s03-travel-idle",
        customer: { monthlyIncome: 50 * TR, monthlySurplus: 20 * TR, mainCasaBalance: 40 * TR, riskProfile: "growth" },
        goals: [
          {
            name: "Du lịch châu Âu cả nhà",
            template: "travel",
            target: 350 * TR,
            createdAt: "2025-12-01",
            targetDate: "2030-06-30",
            opening: 120 * TR,
            monthly: 5 * TR,
            dayOfMonth: 12,
            assets: [{ type: "liquid", category: "fund", productId: FUND_EQUITY.id, amount: 40 * TR, createdAt: "2026-06-15" }],
          },
        ],
      }),
  },
  {
    id: "s04-education-fixed",
    code: "4",
    title: "Học phí con — có xe cũ tính vào mục tiêu",
    description: "Xe Honda City (tự khai 420 triệu, tính 70%) định giá từ 06/2025 — đã quá 12 tháng, cần định giá lại.",
    highlights: ["Tài sản cố định + % tính vào mục tiêu", "Nhắc định giá lại", "Nhãn nguồn: Tự khai"],
    jumpTo: { screen: "RevalueAsset", params: { goalId: "goal-1001", assetId: "asset-1003" } },
    build: () =>
      buildWorld({
        scenarioId: "s04-education-fixed",
        customer: { monthlyIncome: 35 * TR, monthlySurplus: 12 * TR, mainCasaBalance: 22 * TR },
        goals: [
          {
            name: "Học phí đại học cho bé Na",
            template: "education",
            target: 800 * TR,
            createdAt: "2024-09-01",
            targetDate: "2029-08-31",
            opening: 50 * TR,
            monthly: 6 * TR,
            dayOfMonth: 15,
            assets: [
              {
                type: "fixed",
                name: "Xe Honda City 2019 (dự định bán)",
                category: "car",
                value: 420 * TR,
                costBasis: 560 * TR,
                valuationDate: "2025-06-01",
                countPercent: 70,
              },
            ],
          },
        ],
      }),
  },
  {
    id: "s05-emergency-withdraw",
    code: "5",
    title: "Quỹ dự phòng — rút khẩn cấp",
    description: "Tài khoản chính chỉ còn 3 triệu, cần rút gấp từ quỹ dự phòng. Thấy tác động lên tiến độ trước khi xác nhận.",
    highlights: ["Rút tiền về tài khoản chính", "Xác nhận + ảnh hưởng tiến độ"],
    jumpTo: { screen: "WithdrawFlow", params: { goalId: "goal-1001", emergency: true } },
    build: () =>
      buildWorld({
        scenarioId: "s05-emergency-withdraw",
        customer: { monthlyIncome: 30 * TR, monthlySurplus: 10 * TR, mainCasaBalance: 3 * TR },
        goals: [
          {
            name: "Quỹ dự phòng 6 tháng",
            template: "emergency",
            target: 120 * TR,
            createdAt: "2025-04-01",
            targetDate: "2027-03-31",
            opening: 30 * TR,
            monthly: 4 * TR,
            dayOfMonth: 2,
            flexibility: "amount_flexible",
          },
        ],
      }),
  },
  {
    id: "s06-early",
    code: "6",
    title: "Đạt trước hạn",
    description: "Nhờ khoản thưởng Tết, mục tiêu đám cưới đã đủ tiền từ 08/10/2026 — sớm 5 tháng.",
    highlights: ["Hoàn thành sớm", "Hoặc giữ tiếp tới ngày dự kiến"],
    jumpTo: { screen: "GoalDetail", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s06-early",
        customer: { monthlyIncome: 38 * TR, monthlySurplus: 14 * TR, mainCasaBalance: 30 * TR },
        goals: [
          {
            name: "Đám cưới tháng 3",
            template: "wedding",
            target: 250 * TR,
            createdAt: "2025-06-01",
            targetDate: "2027-03-31",
            opening: 80 * TR,
            monthly: 8 * TR,
            dayOfMonth: 8,
            reachedEarlyAt: "2026-10-08",
            extraTxns: [{ kind: "deposit", amount: 40 * TR, date: "2026-02-10", note: "Thưởng Tết" }],
          },
        ],
      }),
  },
  {
    id: "s07-missed",
    code: "7",
    title: "Đến hạn vẫn thiếu, không vay",
    description: "Hạn 15/10/2026 đã qua, mới có ~80%. Chọn: gia hạn, giảm mục tiêu, vay, hoặc đóng mục tiêu.",
    highlights: ["Kết quả đến hạn — nhánh thiếu", "Các lựa chọn khi chưa đạt"],
    jumpTo: { screen: "DueResult", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s07-missed",
        customer: { monthlyIncome: 32 * TR, monthlySurplus: 11 * TR, mainCasaBalance: 18 * TR },
        goals: [
          {
            name: "Sửa nhà bếp & phòng tắm",
            template: "other",
            target: 300 * TR,
            createdAt: "2025-04-15",
            targetDate: "2026-10-15",
            status: "missed",
            opening: 60 * TR,
            monthly: 10 * TR,
            dayOfMonth: 16,
            historyUntil: "2026-10-15",
          },
        ],
      }),
  },
  {
    id: "s08-so-failed",
    code: "8",
    title: "Trích định kỳ thất bại",
    description: "Ngày 15/10 trích 5 triệu không thành công vì tài khoản chính chỉ còn 1,2 triệu (lương về ngày 25).",
    highlights: ["Thông báo trích thất bại", "Đổi ngày trích sau ngày lương / nạp bù"],
    jumpTo: { screen: "StandingOrderManage", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s08-so-failed",
        customer: { monthlyIncome: 28 * TR, monthlySurplus: 7 * TR, mainCasaBalance: 1.2 * TR, salaryDay: 25 },
        goals: [
          {
            name: "Du lịch Nhật Bản",
            template: "travel",
            target: 90 * TR,
            createdAt: "2026-01-10",
            targetDate: "2027-04-30",
            opening: 10 * TR,
            monthly: 5 * TR,
            dayOfMonth: 15,
            soFailedOn: ["2026-10-15"],
          },
        ],
      }),
  },
  {
    id: "s09-repaying-overdue",
    code: "9",
    title: "Giai đoạn 2 — kỳ trả quá hạn, có tiền dư",
    description: "Đã mua xe bằng khoản vay 150 triệu. Kỳ 10/10 quá hạn do rút viện phí; nay tài khoản mục tiêu đã có tiền để trả và trả trước.",
    highlights: ["Tích luỹ & trả nợ", "Kỳ quá hạn", "Trả trước giảm lãi"],
    jumpTo: { screen: "RepayOverview", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s09-repaying-overdue",
        customer: { monthlyIncome: 40 * TR, monthlySurplus: 18 * TR, mainCasaBalance: 26 * TR },
        goals: [
          {
            name: "Mua Toyota Vios",
            template: "car",
            target: 600 * TR,
            createdAt: "2024-04-01",
            targetDate: "2026-04-30",
            status: "repaying",
            achievedAt: "2026-05-10",
            opening: 100 * TR,
            monthly: 15 * TR,
            dayOfMonth: 12,
            loan: { productId: LOAN_CAR.id, principal: 150 * TR, termMonths: 36, disbursedAt: "2026-05-10", paidThrough: "2026-09-10" },
            extraTxns: [
              { kind: "withdraw", amount: "all", date: "2026-05-10", note: "Thanh toán mua xe Toyota Vios" },
              { kind: "withdraw", amount: 55 * TR, date: "2026-10-03", note: "Rút khẩn cấp: viện phí" },
              { kind: "deposit", amount: 30 * TR, date: "2026-10-14", note: "Nạp thêm từ tài khoản chính" },
            ],
          },
        ],
      }),
  },
  {
    id: "s10-multi-priority",
    code: "10",
    title: "Nhiều mục tiêu tranh mức dư",
    description: "Dư 20 triệu/tháng nhưng mua nhà đã cần gần 25 triệu. Hai mục tiêu sau không còn phần — cần sắp xếp ưu tiên.",
    highlights: ["Chia số dư theo thứ tự ưu tiên", "Kéo thả / đổi thứ tự ưu tiên"],
    jumpTo: { screen: "GoalList", params: { tab: "active" } },
    build: () =>
      buildWorld({
        scenarioId: "s10-multi-priority",
        customer: { monthlyIncome: 55 * TR, monthlySurplus: 20 * TR, mainCasaBalance: 45 * TR },
        goals: [
          {
            name: "Mua nhà",
            template: "house",
            target: 1_500 * TR,
            createdAt: "2025-03-01",
            targetDate: "2029-12-31",
            opening: 300 * TR,
            monthly: 12 * TR,
            dayOfMonth: 10,
            priority: 1,
          },
          {
            name: "Du lịch Hàn Quốc",
            template: "travel",
            target: 60 * TR,
            createdAt: "2026-05-01",
            targetDate: "2027-05-31",
            opening: 10 * TR,
            monthly: 3 * TR,
            dayOfMonth: 10,
            priority: 2,
          },
          {
            name: "Đổi xe máy",
            template: "car",
            target: 80 * TR,
            createdAt: "2026-02-01",
            targetDate: "2027-12-31",
            opening: 15 * TR,
            monthly: 3 * TR,
            dayOfMonth: 10,
            priority: 3,
          },
        ],
      }),
  },
  {
    id: "s11-new-customer",
    code: "11",
    title: "Khách mới — chưa đủ dữ liệu",
    description: "Mới dùng app 1 tháng, chưa biết mức dư hằng tháng. Kết quả khả thi hiển thị “chưa đủ dữ liệu” thay vì đoán.",
    highlights: ["Mức dư: chưa rõ", "Tạo mục tiêu với số liệu tự khai"],
    jumpTo: { screen: "TemplatePick" },
    build: () =>
      buildWorld({
        scenarioId: "s11-new-customer",
        customer: {
          name: "Trần Thu Hà",
          monthlyIncome: 25 * TR,
          monthlySurplus: "unknown",
          monthlyExpenses: 18 * TR,
          mainCasaBalance: 25 * TR,
          dataMonths: 1,
        },
        goals: [],
      }),
  },
  {
    id: "s12-maturity",
    code: "12",
    title: "Tiền gửi sắp đáo hạn",
    description: "Khoản tiền gửi 6 tháng 150 triệu đáo hạn 20/10/2026. Tua 7 ngày để chọn tái tục hay chuyển về tài khoản mục tiêu.",
    highlights: ["Tài sản linh hoạt có ngày đáo hạn", "Tua thời gian → lựa chọn khi đáo hạn"],
    jumpTo: { screen: "LiquidAssetDetail", params: { goalId: "goal-1001", assetId: "asset-1003" } },
    build: () =>
      buildWorld({
        scenarioId: "s12-maturity",
        customer: { monthlyIncome: 40 * TR, monthlySurplus: 22 * TR, mainCasaBalance: 30 * TR },
        goals: [
          {
            name: "Mua VinFast VF5",
            template: "car",
            target: 500 * TR,
            createdAt: "2025-08-01",
            targetDate: "2027-08-31",
            opening: 100 * TR,
            monthly: 12 * TR,
            dayOfMonth: 3,
            assets: [{ type: "liquid", category: "term_deposit", productId: ONLINE_DEPOSIT.id, amount: 150 * TR, createdAt: "2026-04-20", termMonths: 6 }],
          },
        ],
      }),
  },
  {
    id: "s13-loan-blocked",
    code: "13",
    title: "Vay vượt khả năng trả — bị chặn",
    description: "Thiếu hơn 4 tỷ; khoản trả hằng tháng sẽ vượt 40% thu nhập (đã có nợ xe 6 triệu/tháng). App không cho vay và gợi ý cách khác.",
    highlights: ["Kiểm tra khả năng trả nợ", "Màn hình bị chặn + phương án thay thế"],
    jumpTo: { screen: "LoanSimulator", params: { goalId: "goal-1001" } },
    build: () =>
      buildWorld({
        scenarioId: "s13-loan-blocked",
        customer: { monthlyIncome: 30 * TR, monthlySurplus: 9 * TR, existingDebtPayment: 6 * TR, mainCasaBalance: 15 * TR },
        goals: [
          {
            name: "Nhà phố Gò Vấp",
            template: "house",
            target: 5_000 * TR,
            createdAt: "2025-06-01",
            targetDate: "2027-12-31",
            opening: 600 * TR,
            monthly: 8 * TR,
            dayOfMonth: 10,
            flexibility: "date_fixed",
          },
        ],
      }),
  },
  {
    id: "empty",
    code: "—",
    title: "Chưa có mục tiêu",
    description: "Khách hàng chưa tạo mục tiêu nào — trạng thái trống với nút tạo mục tiêu.",
    highlights: ["Empty state + CTA"],
    jumpTo: { screen: "GoalList" },
    build: () => buildWorld({ scenarioId: "empty", goals: [] }),
  },
];

export const DEFAULT_SCENARIO_ID = "demo";

export function getScenario(id: string | undefined): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
