/**
 * The three prototype personas and their authored holdings.
 *
 * Transactions are generated (see fixtures/generate.ts); assets, liabilities,
 * budgets and goals are hand-authored per persona so the wealth picture is
 * realistic and exercises edge cases (unknown values, multiple liabilities).
 */

import type {
  Asset,
  Beneficiary,
  Budget,
  Goal,
  Liability,
  MockProduct,
} from "@/domain/models";
import { CATEGORY } from "@/domain/models";

export type PersonaId = "stable" | "irregular" | "wealthy";
export const DEFAULT_PERSONA: PersonaId = "stable";

/** Tunables the transaction generator reads. */
export interface PersonaParams {
  seed: number;
  /** Base monthly salary/primary income in VND. */
  salaryBase: number;
  /** Fractional month-to-month income variance (0 = flat). */
  salaryVariance: number;
  /** Multiplier on discretionary spend volume/size. */
  discretionaryScale: number;
  /** Probability of a second/side income in a given month. */
  extraIncomeChance: number;
  /** Base monthly housing (rent/mortgage servicing) in VND. */
  housingBase: number;
}

export interface PersonaMeta {
  id: PersonaId;
  /** Sample customer id shown on the login screen (CIF_0001..0003). */
  cif: string;
  label: string;
  description: string;
  /** Display-only membership tier shown on the primary account (source: mock). */
  tier: string;
  params: PersonaParams;
  assets: Asset[];
  liabilities: Liability[];
  budgets: Budget[];
  goals: Goal[];
  products: MockProduct[];
  /** Saved payees (real-shaped mock account numbers) for transfer drafting. */
  beneficiaries: Beneficiary[];
}

const NOW = "2026-09-15T00:00:00.000Z";

const MSB_PRODUCTS: MockProduct[] = [
  { id: "p_savings_flex", name: "Tiết kiệm linh hoạt MSB", type: "savings", summary: "Gửi/rút linh hoạt, lãi cao hơn tài khoản thanh toán.", indicativeRate: 0.041 },
  { id: "p_deposit_12m", name: "Tiền gửi có kỳ hạn 12 tháng", type: "deposit", summary: "Lãi suất cố định, kỳ hạn 12 tháng.", indicativeRate: 0.056 },
  { id: "p_fund_balanced", name: "Quỹ cân bằng MSB", type: "fund", summary: "Danh mục cổ phiếu/trái phiếu cân bằng, rủi ro trung bình." },
];

function budget(categoryId: string, limit: number): Budget {
  return { categoryId, limit, period: "monthly" };
}

function bene(id: string, name: string, accountNumber: string, bankName: string): Beneficiary {
  return { id, name, accountNumber, bankName, source: "mock" };
}

// ---------------------------------------------------------------------------

const STABLE: PersonaMeta = {
  id: "stable",
  cif: "CIF_0001",
  label: "Minh — Lương ổn định",
  description: "Nhân viên văn phòng, lương cố định, ít nợ, chi tiêu đều đặn.",
  tier: "M-FIRST GOLD",
  params: { seed: 1001, salaryBase: 25_000_000, salaryVariance: 0.02, discretionaryScale: 1, extraIncomeChance: 0.1, housingBase: 6_000_000 },
  assets: [
    { id: "a_stable_deposit", type: "deposit", name: "Tiền gửi 6 tháng", value: 80_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: false },
    { id: "a_stable_fund", type: "fund", name: "Quỹ mở VN", value: 35_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
    { id: "a_stable_gold", type: "gold", name: "Vàng SJC (2 chỉ)", value: 15_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
  ],
  liabilities: [
    { id: "l_stable_loan", type: "personal_loan", name: "Vay tiêu dùng", outstandingPrincipal: 40_000_000, interestRate: 0.14, minimumPayment: 3_500_000, dueDate: "2026-09-25", remainingTerm: 12, source: "self_reported", lastUpdatedAt: NOW },
  ],
  budgets: [budget(CATEGORY.dining, 4_000_000), budget(CATEGORY.groceries, 3_500_000), budget(CATEGORY.transport, 1_500_000), budget(CATEGORY.shopping, 2_500_000), budget(CATEGORY.entertainment, 1_500_000)],
  goals: [{ id: "g_stable_fund", name: "Quỹ dự phòng 6 tháng", targetAmount: 90_000_000, currentAmount: 55_000_000, targetDate: "2027-06-30", source: "self_reported" }],
  products: MSB_PRODUCTS,
  beneficiaries: [
    bene("b_stable_lan", "Nguyễn Thị Lan", "19012345678901", "MSB"),
    bene("b_stable_binh", "Trần Văn Bình", "0071000123456", "Vietcombank"),
    bene("b_stable_landlord", "Chủ nhà Phạm Văn Đức", "12010009988776", "MSB"),
  ],
};

const IRREGULAR: PersonaMeta = {
  id: "irregular",
  cif: "CIF_0002",
  label: "Lan — Thu nhập biến động",
  description: "Freelancer, thu nhập lên xuống, chi tiêu tùy hứng, hay vượt ngân sách.",
  tier: "M-FIRST",
  params: { seed: 2002, salaryBase: 22_000_000, salaryVariance: 0.55, discretionaryScale: 1.6, extraIncomeChance: 0.5, housingBase: 7_500_000 },
  assets: [
    { id: "a_irr_cash", type: "cash", name: "Tiền mặt & ví", value: 12_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
    { id: "a_irr_fund", type: "fund", name: "Chứng chỉ quỹ", value: 18_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
  ],
  liabilities: [
    { id: "l_irr_card", type: "credit_card", name: "Thẻ tín dụng MSB", outstandingPrincipal: 18_500_000, interestRate: 0.32, minimumPayment: 1_850_000, dueDate: "2026-09-20", remainingTerm: null, source: "msb", lastUpdatedAt: NOW },
    { id: "l_irr_instal", type: "instalment", name: "Trả góp điện thoại", outstandingPrincipal: 9_000_000, interestRate: 0, minimumPayment: 1_500_000, dueDate: "2026-09-28", remainingTerm: 6, source: "self_reported", lastUpdatedAt: NOW },
  ],
  budgets: [budget(CATEGORY.dining, 3_000_000), budget(CATEGORY.groceries, 2_500_000), budget(CATEGORY.transport, 1_200_000), budget(CATEGORY.shopping, 2_000_000), budget(CATEGORY.entertainment, 1_500_000)],
  goals: [{ id: "g_irr_buffer", name: "Đệm thu nhập 3 tháng", targetAmount: 60_000_000, currentAmount: 12_000_000, targetDate: null, source: "self_reported" }],
  products: MSB_PRODUCTS,
  beneficiaries: [
    bene("b_irr_khang", "Đỗ Minh Khang", "19088776655443", "MSB"),
    bene("b_irr_studio", "Studio Ánh Dương", "0451000778899", "Techcombank"),
  ],
};

const WEALTHY: PersonaMeta = {
  id: "wealthy",
  cif: "CIF_0003",
  label: "Hùng — Tài sản cao",
  description: "Thu nhập cao, nhiều tài sản & nhiều khoản nợ, có tài sản chưa định giá.",
  tier: "M-FIRST PRIVATE",
  params: { seed: 3003, salaryBase: 80_000_000, salaryVariance: 0.08, discretionaryScale: 2.2, extraIncomeChance: 0.4, housingBase: 22_000_000 },
  assets: [
    { id: "a_w_deposit", type: "deposit", name: "Tiền gửi kỳ hạn", value: 500_000_000, currency: "VND", source: "msb", lastUpdatedAt: NOW, isEstimated: false },
    { id: "a_w_fund", type: "fund", name: "Danh mục quỹ", value: 320_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
    { id: "a_w_stock", type: "stock", name: "Cổ phiếu niêm yết", value: 210_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
    { id: "a_w_gold", type: "gold", name: "Vàng miếng", value: 90_000_000, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
    { id: "a_w_realestate", type: "real_estate", name: "Căn hộ (chưa định giá)", value: null, currency: "VND", source: "self_reported", lastUpdatedAt: NOW, isEstimated: true },
  ],
  liabilities: [
    { id: "l_w_mortgage", type: "mortgage", name: "Vay mua nhà", outstandingPrincipal: 1_800_000_000, interestRate: 0.095, minimumPayment: 24_000_000, dueDate: "2026-09-18", remainingTerm: 180, source: "msb", lastUpdatedAt: NOW },
    { id: "l_w_card", type: "credit_card", name: "Thẻ tín dụng hạng vàng", outstandingPrincipal: 45_000_000, interestRate: 0.30, minimumPayment: 4_500_000, dueDate: "2026-09-22", remainingTerm: null, source: "msb", lastUpdatedAt: NOW },
    { id: "l_w_loan", type: "personal_loan", name: "Vay đầu tư", outstandingPrincipal: 200_000_000, interestRate: 0.12, minimumPayment: 10_000_000, dueDate: "2026-10-05", remainingTerm: 24, source: "self_reported", lastUpdatedAt: NOW },
  ],
  budgets: [budget(CATEGORY.dining, 12_000_000), budget(CATEGORY.groceries, 6_000_000), budget(CATEGORY.transport, 5_000_000), budget(CATEGORY.shopping, 15_000_000), budget(CATEGORY.entertainment, 8_000_000)],
  goals: [{ id: "g_w_house", name: "Trả trước nhà nghỉ dưỡng", targetAmount: 2_000_000_000, currentAmount: 650_000_000, targetDate: "2028-12-31", source: "self_reported" }],
  products: MSB_PRODUCTS,
  beneficiaries: [
    bene("b_w_quan", "Vũ Đình Quân", "19055443322110", "MSB"),
    bene("b_w_broker", "Công ty CP Đầu tư An Phú", "0331000445566", "ACB"),
    bene("b_w_hoa", "Lê Thị Hoa", "0071000998877", "Vietcombank"),
  ],
};

export const PERSONAS: Record<PersonaId, PersonaMeta> = {
  stable: STABLE,
  irregular: IRREGULAR,
  wealthy: WEALTHY,
};

export const PERSONA_LIST: PersonaMeta[] = [STABLE, IRREGULAR, WEALTHY];
