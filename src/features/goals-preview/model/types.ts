/**
 * Domain types for the "Mục tiêu" clickable prototype (goals-preview).
 * Client-only, everything simulated. Dates are ISO "YYYY-MM-DD" strings so the
 * state serialises cleanly to localStorage and stays deterministic.
 */

export type ISODate = string;

/** Who produced a number shown to the customer. */
export type ValueSource = "msb" | "self_reported" | "estimated";

// ---------------------------------------------------------------- customer

export type RiskProfile = "conservative" | "balanced" | "growth";

export interface CustomerProfile {
  name: string;
  cif: string;
  /** Thu nhập hằng tháng (VND). */
  monthlyIncome: number;
  /** Số dư hằng tháng sau chi tiêu & trả nợ; "unknown" khi khách mới chưa đủ dữ liệu. */
  monthlySurplus: number | "unknown";
  /** Chi tiêu sinh hoạt thực tế — chỉ máy mô phỏng biết, dùng khi tua thời gian. */
  monthlyExpenses: number;
  /** Khoản trả nợ hiện có mỗi tháng (ngoài mục tiêu). */
  existingDebtPayment: number;
  mainCasaNumber: string;
  mainCasaBalance: number;
  /** Ngày nhận lương trong tháng (1–28). */
  salaryDay: number;
  riskProfile: RiskProfile;
  /** Số tháng dữ liệu giao dịch app đã có. */
  dataMonths: number;
}

// ---------------------------------------------------------------- goal

export type GoalTemplate =
  | "car"
  | "house"
  | "travel"
  | "education"
  | "emergency"
  | "wedding"
  | "retirement"
  | "other";

/**
 * Lifecycle:
 * draft → accumulating → completed
 *                     ↘ (đến hạn, thiếu, vay) achieved → repaying → completed
 *                     ↘ (đến hạn, thiếu, không vay) missed → (gia hạn/giảm) accumulating | closed
 * paused / closed at any time (closed is terminal).
 */
export type GoalStatus =
  | "draft"
  | "accumulating"
  | "paused"
  | "achieved"
  | "repaying"
  | "completed"
  | "missed"
  | "closed";

/** Giai đoạn 1 = tích luỹ, giai đoạn 2 = tích luỹ & trả nợ. */
export type GoalPhase = 1 | 2;

/** How the customer can bend if the plan does not fit. */
export type GoalFlexibility = "date_fixed" | "date_flexible" | "amount_flexible";

export type ProgressState = "on_track" | "ahead" | "slightly_behind" | "off_track";

export interface StandingOrder {
  amount: number;
  /** Ngày trích trong tháng (1–28). */
  dayOfMonth: number;
  active: boolean;
  /** Next date the order will run. */
  nextRunDate: ISODate;
  lastRunDate?: ISODate;
  lastResult?: "ok" | "failed";
  /** Consecutive failures. */
  failedCount: number;
}

export interface Goal {
  id: string;
  name: string;
  template: GoalTemplate;
  targetAmount: number;
  targetDate: ISODate;
  flexibility: GoalFlexibility;
  /** 1 = cao nhất; số dư hằng tháng được chia theo thứ tự này. */
  priority: number;
  status: GoalStatus;
  createdAt: ISODate;
  /** Undefined while status is "draft". */
  accountId?: string;
  standingOrder?: StandingOrder;
  loanId?: string;
  /** Date the goal value first reached the target before targetDate. */
  reachedEarlyAt?: ISODate;
  achievedAt?: ISODate;
  completedAt?: ISODate;
  closedAt?: ISODate;
  /** Goal value captured when it was completed / closed (the account may be emptied after). */
  finalValue?: number;
  /** True when completed before targetDate. */
  completedEarly?: boolean;
  /** Status before pausing, to resume into. */
  pausedFrom?: GoalStatus;
  /** Original values kept when the customer extends / reduces. */
  originalTargetAmount?: number;
  originalTargetDate?: ISODate;
  note?: string;
}

// ---------------------------------------------------------------- account & txns

export interface GoalAccount {
  id: string;
  goalId: string;
  /** Số tài khoản mục tiêu (CASA riêng). */
  number: string;
  name: string;
  balance: number;
  /** Lãi suất không kỳ hạn, %/năm. */
  interestRatePa: number;
  openedAt: ISODate;
  status: "open" | "closed";
}

export type GoalTxnKind =
  | "deposit"
  | "withdraw"
  | "interest"
  | "invest"
  | "divest"
  | "maturity"
  | "loan_disbursement"
  | "loan_repayment"
  | "standing_order"
  | "standing_order_failed";

export interface GoalTxn {
  id: string;
  goalId: string;
  accountId: string;
  kind: GoalTxnKind;
  /** Always ≥ 0; direction comes from `kind` (see TXN_DIRECTION). */
  amount: number;
  date: ISODate;
  note: string;
  balanceAfter?: number;
}

/** +1 tiền vào tài khoản mục tiêu, -1 tiền ra, 0 không đổi số dư. */
export const TXN_DIRECTION: Record<GoalTxnKind, 1 | -1 | 0> = {
  deposit: 1,
  withdraw: -1,
  interest: 1,
  invest: -1,
  divest: 1,
  maturity: 1,
  loan_disbursement: 1,
  loan_repayment: -1,
  standing_order: 1,
  standing_order_failed: 0,
};

// ---------------------------------------------------------------- assets

export type FixedAssetCategory = "house" | "car" | "motorbike" | "gold" | "other";
export type LiquidAssetCategory = "savings" | "term_deposit" | "fund" | "bond";

interface AssetBase {
  id: string;
  goalId: string;
  name: string;
  /** Giá vốn (VND) — số tiền đã bỏ ra. */
  costBasis: number;
  /** Last recorded value (VND). Liquid assets are re-priced by the engine. */
  value: number;
  valuationDate: ISODate;
  /** % giá trị được tính vào mục tiêu (0–100). */
  countPercent: number;
  source: ValueSource;
  status: "held" | "matured" | "sold";
  createdAt: ISODate;
}

/** Tài sản cố định: nhà, xe, vàng cất nhà… giá tự khai, không có nguồn giá. */
export interface FixedAsset extends AssetBase {
  type: "fixed";
  category: FixedAssetCategory;
  productId?: undefined;
}

/** Tài sản linh hoạt: sản phẩm MSB có giá biết trước. */
export interface LiquidAsset extends AssetBase {
  type: "liquid";
  category: LiquidAssetCategory;
  productId: string;
  /** Fund / bond units. */
  units?: number;
  /** Last unit price (fund / bond). */
  price?: number;
  /** Deposit principal. */
  principal?: number;
  ratePa?: number;
  termMonths?: number;
  maturityDate?: ISODate;
}

export type Asset = FixedAsset | LiquidAsset;

// ---------------------------------------------------------------- loan

export type LoanRowStatus = "paid" | "due" | "overdue" | "upcoming";

export interface LoanScheduleRow {
  period: number;
  dueDate: ISODate;
  principal: number;
  interest: number;
  payment: number;
  /** Dư nợ sau kỳ. */
  remaining: number;
  status: LoanRowStatus;
  paidAt?: ISODate;
}

export interface Loan {
  id: string;
  goalId: string;
  productId: string;
  principal: number;
  ratePa: number;
  termMonths: number;
  disbursedAt: ISODate;
  monthlyPayment: number;
  schedule: LoanScheduleRow[];
  /** Total prepaid principal so far. */
  prepaid: number;
  status: "active" | "paid_off";
}

// ---------------------------------------------------------------- products

export interface SavingsProduct {
  kind: "savings";
  id: string;
  name: string;
  description: string;
  ratePa: number;
  minAmount: number;
}

export interface TermOption {
  months: number;
  ratePa: number;
}

export interface TermDepositProduct {
  kind: "term_deposit";
  id: string;
  name: string;
  description: string;
  terms: TermOption[];
  /** Lãi khi rút trước hạn, %/năm. */
  earlyWithdrawRatePa: number;
  minAmount: number;
}

export interface PricePoint {
  date: ISODate;
  price: number;
}

export type RiskLevel = "low" | "medium" | "high";

export interface FundProduct {
  kind: "fund";
  id: string;
  name: string;
  description: string;
  riskLevel: RiskLevel;
  /** Daily price is linearly interpolated between these anchors. */
  priceSeries: PricePoint[];
  minAmount: number;
  /** Phí bán (%), áp dụng nếu nắm giữ dưới `feeFreeAfterMonths`. */
  sellFeePct: number;
  feeFreeAfterMonths: number;
}

export interface BondProduct {
  kind: "bond";
  id: string;
  name: string;
  description: string;
  couponPa: number;
  unitPrice: number;
  maturityDate: ISODate;
  minAmount: number;
}

export type LoanPurpose = "house" | "car" | "consumer";

export interface LoanProduct {
  kind: "loan";
  id: string;
  name: string;
  description: string;
  purpose: LoanPurpose;
  ratePa: number;
  maxTermMonths: number;
  minAmount: number;
  maxAmount: number;
}

export type InvestProduct = SavingsProduct | TermDepositProduct | FundProduct | BondProduct;
export type Product = InvestProduct | LoanProduct;

// ---------------------------------------------------------------- sim

export interface SimClock {
  today: ISODate;
}

export interface MarketState {
  /** Manual shift applied on top of every fund price series (%, e.g. -10). */
  fundPriceShiftPct: number;
}

export type ToastTone = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}
