import type {
  BondProduct,
  FundProduct,
  InvestProduct,
  LoanProduct,
  LoanPurpose,
  PricePoint,
  Product,
  SavingsProduct,
  TermDepositProduct,
} from "../model/types";

/**
 * Mock MSB product catalog (rates and prices are illustrative, not real offers).
 * Fund prices are monthly anchors; the engine interpolates daily.
 */

export const SAVINGS_FLEX: SavingsProduct = {
  kind: "savings",
  id: "msb-savings-flex",
  name: "Tiết kiệm linh hoạt MSB",
  description: "Gửi rút bất kỳ lúc nào, lãi tính theo ngày.",
  ratePa: 3.0,
  minAmount: 1_000_000,
};

export const TERM_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-term-deposit",
  name: "Tiền gửi có kỳ hạn MSB",
  description: "Lãi suất cố định theo kỳ hạn. Rút trước hạn hưởng lãi không kỳ hạn.",
  terms: [
    { months: 1, ratePa: 3.5 },
    { months: 3, ratePa: 3.9 },
    { months: 6, ratePa: 5.0 },
    { months: 12, ratePa: 5.6 },
    { months: 24, ratePa: 5.9 },
  ],
  earlyWithdrawRatePa: 0.5,
  minAmount: 1_000_000,
};

export const ONLINE_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-online-deposit",
  name: "Tiền gửi Online MSB",
  description: "Mở trên app, lãi cao hơn tại quầy 0,2%/năm.",
  terms: [
    { months: 1, ratePa: 3.7 },
    { months: 3, ratePa: 4.1 },
    { months: 6, ratePa: 5.2 },
    { months: 12, ratePa: 5.8 },
    { months: 24, ratePa: 6.1 },
  ],
  earlyWithdrawRatePa: 0.5,
  minAmount: 1_000_000,
};

/** Deterministic monthly series: base × (1 + drift·t + wave), plus optional dip. */
function series(
  start: string,
  months: number,
  base: number,
  driftPerMonth: number,
  wave: number,
  dips: { month: string; pct: number }[] = [],
): PricePoint[] {
  const [y0, m0] = start.split("-").map(Number);
  const points: PricePoint[] = [];
  for (let i = 0; i < months; i++) {
    const total = y0 * 12 + (m0 - 1) + i;
    const y = Math.floor(total / 12);
    const m = total - y * 12 + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const dip = dips.find((d) => d.month === key)?.pct ?? 0;
    const price = base * (1 + driftPerMonth * i + wave * Math.sin(i / 2.3)) * (1 + dip / 100);
    points.push({ date: `${key}-01`, price: Math.round(price) });
  }
  return points;
}

export const FUND_BOND: FundProduct = {
  kind: "fund",
  id: "msb-fund-bond",
  name: "Quỹ Trái phiếu MSB An Tâm",
  description: "Đầu tư chủ yếu vào trái phiếu, biến động thấp.",
  riskLevel: "low",
  priceSeries: series("2024-01", 72, 12_000, 0.0055, 0.004),
  minAmount: 100_000,
  sellFeePct: 0.5,
  feeFreeAfterMonths: 6,
};

export const FUND_EQUITY: FundProduct = {
  kind: "fund",
  id: "msb-fund-equity",
  name: "Quỹ Cổ phiếu MSB Tăng Trưởng",
  description: "Đầu tư vào cổ phiếu niêm yết, kỳ vọng cao nhưng có thể giảm giá trong ngắn hạn.",
  riskLevel: "high",
  priceSeries: series("2024-01", 72, 18_000, 0.009, 0.05, [
    { month: "2026-09", pct: -9 },
    { month: "2026-10", pct: -12 },
    { month: "2026-11", pct: -8 },
    { month: "2026-12", pct: -3 },
  ]),
  minAmount: 100_000,
  sellFeePct: 1.0,
  feeFreeAfterMonths: 12,
};

export const BOND_MSB: BondProduct = {
  kind: "bond",
  id: "msb-bond-2028",
  name: "Trái phiếu MSB 2028",
  description: "Trái phiếu do MSB phát hành, lãi cố định trả hằng năm.",
  couponPa: 6.5,
  unitPrice: 100_000,
  maturityDate: "2028-12-31",
  minAmount: 10_000_000,
};

export const LOAN_HOUSE: LoanProduct = {
  kind: "loan",
  id: "msb-loan-house",
  name: "Vay mua nhà MSB",
  description: "Vay tới 25 năm, thế chấp bằng chính căn nhà.",
  purpose: "house",
  ratePa: 9.0,
  maxTermMonths: 300,
  minAmount: 100_000_000,
  maxAmount: 10_000_000_000,
};

export const LOAN_CAR: LoanProduct = {
  kind: "loan",
  id: "msb-loan-car",
  name: "Vay mua xe MSB",
  description: "Vay tới 8 năm, thế chấp bằng chính chiếc xe.",
  purpose: "car",
  ratePa: 9.5,
  maxTermMonths: 96,
  minAmount: 50_000_000,
  maxAmount: 3_000_000_000,
};

export const LOAN_CONSUMER: LoanProduct = {
  kind: "loan",
  id: "msb-loan-consumer",
  name: "Vay tiêu dùng MSB",
  description: "Không cần tài sản bảo đảm, vay tới 5 năm.",
  purpose: "consumer",
  ratePa: 14.0,
  maxTermMonths: 60,
  minAmount: 10_000_000,
  maxAmount: 500_000_000,
};

export const INVEST_PRODUCTS: InvestProduct[] = [SAVINGS_FLEX, TERM_DEPOSIT, ONLINE_DEPOSIT, FUND_BOND, FUND_EQUITY, BOND_MSB];
export const LOAN_PRODUCTS: LoanProduct[] = [LOAN_HOUSE, LOAN_CAR, LOAN_CONSUMER];
export const ALL_PRODUCTS: Product[] = [...INVEST_PRODUCTS, ...LOAN_PRODUCTS];

export function getProduct(id: string | undefined): Product | undefined {
  return ALL_PRODUCTS.find((p) => p.id === id);
}

export function getInvestProduct(id: string | undefined): InvestProduct | undefined {
  return INVEST_PRODUCTS.find((p) => p.id === id);
}

export function getLoanProduct(id: string | undefined): LoanProduct | undefined {
  return LOAN_PRODUCTS.find((p) => p.id === id);
}

export function loanProductFor(purpose: LoanPurpose): LoanProduct {
  return LOAN_PRODUCTS.find((p) => p.purpose === purpose) ?? LOAN_CONSUMER;
}
