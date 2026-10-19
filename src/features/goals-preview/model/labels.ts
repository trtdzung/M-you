import type {
  FixedAssetCategory,
  GoalFlexibility,
  GoalStatus,
  GoalTemplate,
  GoalTxnKind,
  LiquidAssetCategory,
  LoanPurpose,
  LoanRowStatus,
  ProgressState,
  RiskLevel,
  RiskProfile,
  ValueSource,
} from "./types";

/** Plain-Vietnamese labels shared by every screen. */

export const STATUS_LABEL: Record<GoalStatus, string> = {
  draft: "Bản nháp",
  accumulating: "Đang tích luỹ",
  paused: "Tạm dừng",
  achieved: "Đạt mục tiêu",
  repaying: "Tích luỹ & trả nợ",
  completed: "Hoàn thành",
  missed: "Chưa đạt",
  closed: "Đã đóng",
};

export const PROGRESS_LABEL: Record<ProgressState, string> = {
  on_track: "Đúng tiến độ",
  ahead: "Nhanh hơn kế hoạch",
  slightly_behind: "Hơi chậm",
  off_track: "Lệch kế hoạch",
};

export const TEMPLATE_LABEL: Record<GoalTemplate, string> = {
  car: "Mua xe",
  house: "Mua nhà",
  travel: "Du lịch",
  education: "Học phí cho con",
  emergency: "Quỹ dự phòng",
  wedding: "Đám cưới",
  retirement: "Nghỉ hưu",
  other: "Mục tiêu khác",
};

export const TEMPLATE_EMOJI: Record<GoalTemplate, string> = {
  car: "🚗",
  house: "🏠",
  travel: "✈️",
  education: "🎓",
  emergency: "🛟",
  wedding: "💍",
  retirement: "🌴",
  other: "🎯",
};

export const FLEXIBILITY_LABEL: Record<GoalFlexibility, string> = {
  date_fixed: "Ngày cố định",
  date_flexible: "Có thể lùi ngày",
  amount_flexible: "Có thể giảm số tiền",
};

export const TXN_LABEL: Record<GoalTxnKind, string> = {
  deposit: "Nạp tiền",
  withdraw: "Rút tiền",
  interest: "Tiền lãi",
  invest: "Đầu tư",
  divest: "Bán tài sản",
  maturity: "Tiền gửi đáo hạn",
  loan_disbursement: "Giải ngân khoản vay",
  loan_repayment: "Trả nợ vay",
  standing_order: "Trích tự động",
  standing_order_failed: "Trích tự động không thành công",
};

export const FIXED_CATEGORY_LABEL: Record<FixedAssetCategory, string> = {
  house: "Nhà, đất",
  car: "Ô tô",
  motorbike: "Xe máy",
  gold: "Vàng",
  other: "Tài sản khác",
  stock: "Cổ phiếu",
  external_fund: "Chứng chỉ quỹ",
  deposit: "Tiền gửi ngân hàng khác",
  bond: "Trái phiếu",
};

export const LIQUID_CATEGORY_LABEL: Record<LiquidAssetCategory, string> = {
  savings: "Tiết kiệm linh hoạt",
  term_deposit: "Tiền gửi có kỳ hạn",
  fund: "Chứng chỉ quỹ",
  bond: "Trái phiếu",
};

export const SOURCE_LABEL: Record<ValueSource, string> = {
  msb: "MSB",
  self_reported: "Tự khai",
  estimated: "Ước tính",
};

export const SOURCE_TITLE: Record<ValueSource, string> = {
  msb: "Số liệu từ hệ thống MSB",
  self_reported: "Giá trị do bạn tự khai",
  estimated: "Giá trị ước tính",
};

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Rủi ro thấp",
  medium: "Rủi ro trung bình",
  high: "Rủi ro cao",
};

export const RISK_PROFILE_LABEL: Record<RiskProfile, string> = {
  conservative: "Thận trọng",
  balanced: "Cân bằng",
  growth: "Tăng trưởng",
};

export const LOAN_PURPOSE_LABEL: Record<LoanPurpose, string> = {
  house: "Vay mua nhà",
  car: "Vay mua xe",
  consumer: "Vay tiêu dùng",
};

export const LOAN_ROW_LABEL: Record<LoanRowStatus, string> = {
  paid: "Đã trả",
  due: "Đến hạn",
  overdue: "Quá hạn",
  upcoming: "Sắp tới",
};
