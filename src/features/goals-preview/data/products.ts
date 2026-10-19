import type {
  InvestProduct,
  LoanProduct,
  LoanPurpose,
  Product,
  SavingsProduct,
  TermDepositProduct,
} from "../model/types";

/**
 * Danh mục sản phẩm MSB theo biểu lãi suất MSB (tiền gửi/tiết kiệm) và gói ưu đãi thế chấp MSB
 * ngày 28/08/2026 (vay). MSB không có quỹ hay trái phiếu nên không có trong danh mục.
 */

export const SAVINGS_FLEX: SavingsProduct = {
  kind: "savings",
  id: "msb-savings-flex",
  name: "Tiết kiệm Rút gốc từng phần MSB",
  description: "Rút một phần trước hạn, phần còn lại giữ lãi.",
  ratePa: 4.75,
  minAmount: 1_000_000,
};

export const TERM_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-term-deposit",
  name: "Tiền gửi có kỳ hạn tại quầy MSB",
  description: "Lãi suất cố định theo kỳ hạn. Rút trước hạn hưởng lãi không kỳ hạn.",
  terms: [
    { months: 1, ratePa: 4.5 },
    { months: 3, ratePa: 4.5 },
    { months: 6, ratePa: 6.1 },
    { months: 12, ratePa: 6.5 },
    { months: 24, ratePa: 6.3 },
    { months: 36, ratePa: 5.8 },
  ],
  earlyWithdrawRatePa: 0,
  minAmount: 1_000_000,
};

export const ONLINE_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-online-deposit",
  name: "Tiền gửi Online MSB",
  description: "Mở trên app, lãi cao hơn gửi tại quầy. Rút trước hạn hưởng lãi không kỳ hạn.",
  terms: [
    { months: 1, ratePa: 4.75 },
    { months: 3, ratePa: 4.75 },
    { months: 6, ratePa: 6.3 },
    { months: 12, ratePa: 6.8 },
    { months: 24, ratePa: 6.6 },
    { months: 36, ratePa: 6.1 },
  ],
  earlyWithdrawRatePa: 0,
  minAmount: 1_000_000,
};

export const LOAN_HOUSE: LoanProduct = {
  kind: "loan",
  id: "msb-loan-house",
  name: "Vay mua nhà MSB",
  description: "Vay mua nhà thế chấp bằng chính căn nhà. Lãi suất cố định 12 tháng đầu theo gói ưu đãi MSB, sau đó thả nổi; phí trả nợ trước hạn năm 1: 3%.",
  purpose: "house",
  ratePa: 12.7,
  maxTermMonths: 480,
  minAmount: 100_000_000,
  maxAmount: 10_000_000_000,
};

export const LOAN_CAR: LoanProduct = {
  kind: "loan",
  id: "msb-loan-car",
  name: "Vay mua xe MSB",
  description: "Vay mua xe thế chấp bằng chính chiếc xe. Lãi suất cố định 12 tháng đầu theo gói ưu đãi MSB, sau đó thả nổi; phí trả nợ trước hạn năm 1: 3%.",
  purpose: "car",
  ratePa: 12.7,
  maxTermMonths: 96,
  minAmount: 50_000_000,
  maxAmount: 3_000_000_000,
};

export const LOAN_CONSUMER: LoanProduct = {
  kind: "loan",
  id: "msb-loan-consumer",
  name: "Vay tiêu dùng có tài sản bảo đảm MSB",
  description: "Vay có tài sản bảo đảm. Lãi suất cố định 12 tháng đầu theo gói ưu đãi MSB, sau đó thả nổi; phí trả nợ trước hạn năm 1: 3%.",
  purpose: "consumer",
  ratePa: 12.7,
  maxTermMonths: 120,
  minAmount: 10_000_000,
  maxAmount: 5_000_000_000,
};

export const INVEST_PRODUCTS: InvestProduct[] = [SAVINGS_FLEX, TERM_DEPOSIT, ONLINE_DEPOSIT];
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
