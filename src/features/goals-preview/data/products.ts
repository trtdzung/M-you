import type {
  InvestProduct,
  LoanProduct,
  LoanPurpose,
  Product,
  SavingsProduct,
  TermDepositProduct,
} from "../model/types";

/**
 * Danh mục sản phẩm MSB theo màn "Khám phá sản phẩm" trên app MSB (19/10/2026) và biểu lãi suất tiền gửi
 * online QĐ 4144/2026 hiệu lực 14/04/2026 (tiết kiệm); gói ưu đãi thế chấp MSB ngày 28/08/2026 (vay).
 */

/** Lợi suất "Lên tới" theo app MSB; chưa có biểu lãi suất công bố. */
export const M_SINH_LOI: SavingsProduct = {
  kind: "savings",
  id: "msb-m-sinh-loi",
  name: "M - Sinh lời",
  description: "Dòng tiền trong tài khoản sinh lời liên tục mỗi ngày.",
  ratePa: 4.0,
  minAmount: 1_000_000,
};

export const SPECIAL_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-special-deposit",
  name: "Tiền gửi lãi suất đặc biệt",
  description: "Dành cho khách hàng chưa có sổ tiết kiệm, hợp đồng tiền gửi, chứng chỉ tiền gửi tại MSB. Tối đa 5 tỷ, mỗi khách 01 sổ.",
  terms: [
    { months: 6, ratePa: 7.0 },
    { months: 12, ratePa: 7.5 },
    { months: 15, ratePa: 7.5 },
    { months: 24, ratePa: 7.5 },
  ],
  earlyWithdrawRatePa: 0,
  minAmount: 1_000_000,
};

export const ONLINE_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-online-deposit",
  name: "Tiền gửi lãi suất cao nhất",
  description: "Gửi tiền và rút tiền một lần trong suốt thời gian gửi. Rút trước hạn hưởng lãi không kỳ hạn.",
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

export const SAVINGS_FLEX: SavingsProduct = {
  kind: "savings",
  id: "msb-savings-flex",
  name: "Tiền gửi rút gốc từng phần",
  description: "Rút một phần trước hạn, phần còn lại giữ lãi.",
  ratePa: 4.75,
  minAmount: 1_000_000,
};

export const PERIODIC_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-periodic-deposit",
  name: "Tiền gửi định kỳ sinh lời",
  description: "Nhận lãi định kỳ hằng tháng. Rút trước hạn hưởng lãi không kỳ hạn.",
  terms: [
    { months: 3, ratePa: 4.5 },
    { months: 6, ratePa: 6.1 },
    { months: 12, ratePa: 6.4 },
    { months: 24, ratePa: 6.2 },
    { months: 36, ratePa: 5.7 },
  ],
  earlyWithdrawRatePa: 0,
  minAmount: 1_000_000,
};

export const UPFRONT_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-upfront-deposit",
  name: "Tiền gửi trả lãi ngay",
  description: "Nhận lãi ngay tại thời điểm gửi. Rút trước hạn hưởng lãi không kỳ hạn.",
  terms: [
    { months: 1, ratePa: 3.9 },
    { months: 3, ratePa: 3.9 },
    { months: 6, ratePa: 4.2 },
    { months: 12, ratePa: 4.8 },
    { months: 24, ratePa: 4.8 },
    { months: 36, ratePa: 4.8 },
  ],
  earlyWithdrawRatePa: 0,
  minAmount: 1_000_000,
};

/** Lãi suất gửi góp Ong Vàng là thả nổi theo biểu MSB từng thời kỳ. */
export const ONG_VANG_DEPOSIT: TermDepositProduct = {
  kind: "term_deposit",
  id: "msb-ong-vang",
  name: "Tiền gửi gửi góp Ong vàng",
  description: "Tích lũy từng khoản nhỏ theo thời gian. Lãi suất thả nổi.",
  terms: [
    { months: 3, ratePa: 3.0 },
    { months: 6, ratePa: 3.6 },
    { months: 12, ratePa: 4.0 },
    { months: 24, ratePa: 4.0 },
    { months: 36, ratePa: 4.0 },
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

export const INVEST_PRODUCTS: InvestProduct[] = [
  M_SINH_LOI,
  SPECIAL_DEPOSIT,
  ONLINE_DEPOSIT,
  SAVINGS_FLEX,
  PERIODIC_DEPOSIT,
  UPFRONT_DEPOSIT,
  ONG_VANG_DEPOSIT,
];
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
