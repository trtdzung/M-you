/**
 * Small Vietnamese UI constants for the Wrapped chrome (states, controls, entry card).
 * Slide copy itself lives in `@/domain/wrapped` (`copyForSlide`); this file holds only
 * what the viewer needs around it. Neutral tone, no urgency, no sharing prompts.
 */

import { MIN_EXPENSE_TXNS, MIN_MONTHS, type WrappedCoverage } from "@/domain/wrapped";

export const WRAPPED_TITLE = "Tổng kết chi tiêu 6 tháng";

export const WRAPPED_ENTRY = {
  title: "Tổng kết 6 tháng gần đây",
  body: "Xem lại chi tiêu của bạn qua vài trang ngắn.",
  cta: "Xem ngay",
} as const;

export const WRAPPED_LOADING = "Đang chuẩn bị tổng kết của bạn…";

export const WRAPPED_ERROR = {
  title: "Chưa thể tạo tổng kết",
  description: "Không tải được dữ liệu cần thiết. Vui lòng thử lại.",
  retry: "Thử lại",
} as const;

export const WRAPPED_CONSENT = {
  title: "Cần quyền truy cập giao dịch",
  description: "Tổng kết được tạo từ giao dịch của bạn trên thiết bị. Hãy cấp quyền truy cập giao dịch để xem.",
  cta: "Xem quyền truy cập dữ liệu",
} as const;

export const WRAPPED_INSUFFICIENT_TITLE = "Chưa đủ dữ liệu để tổng kết";

/** Names the condition that failed (months first, like the coverage rule). */
export function insufficientDescription(coverage: WrappedCoverage | null): string {
  if (coverage?.insufficientReason === "transactions") {
    return `Cần thêm giao dịch để tổng kết (cần ít nhất ${MIN_EXPENSE_TXNS} giao dịch chi tiêu, hiện có ${coverage.countedExpenseCount}).`;
  }
  const have = coverage ? ` (hiện có ${coverage.monthsWithData})` : "";
  return `Cần ít nhất ${MIN_MONTHS} tháng có chi tiêu${have}.`;
}

export const WRAPPED_BACK = "Về trang Tổng quan";

export const VIEWER = {
  close: "Đóng tổng kết",
  hideAmounts: "Ẩn số tiền",
  previous: "Trang trước",
  next: "Trang sau",
  region: "Tổng kết chi tiêu",
  slide: "trang",
} as const;

export const pageOf = (index: number, total: number): string => `Trang ${index}/${total}`;

/** Honest partial-coverage chip; shown only when some months have no expense data. */
export const coverageChip = (monthsWithData: number, monthsTotal: number): string =>
  `${monthsWithData}/${monthsTotal} tháng có dữ liệu`;

/** Archetype flip card: the only interactive control inside a slide besides the closing CTA. */
export const ARCHETYPE_UI = {
  /** One static label; the pressed state is announced through `aria-pressed`. */
  showEvidence: "Xem cơ sở của nhãn",
  evidenceTitle: "Cơ sở của nhãn này",
} as const;

/** Top-merchants list. */
export const MERCHANT_UI = {
  visits: "lượt",
  top3Caption: (share: string): string => `3 nơi đầu chiếm ${share} số lượt chi`,
} as const;

/** Recurring receipt: at most `RECEIPT_MAX_ROWS` rows, the rest folded into one line. */
export const RECEIPT_MAX_ROWS = 3;
export const RECEIPT_UI = {
  perYear: "/năm",
  more: (count: number): string => `+${count} khoản khác`,
} as const;

/** Short labels of the evidence facts the archetype may cite (the back of the flip card). */
export const EVIDENCE_LABEL = {
  "fixed-share-excl-person": "Chi cố định",
  "weekend-share-excl-person": "Chi vào cuối tuần",
  "top3-share": "3 nơi ghé nhiều nhất",
  "distinct-merchants": "Số nơi đã chi",
} as const;

/** Closing recap bento. */
export const RECAP_TITLE = "Tóm tắt của bạn";
export const RECAP_ARCHETYPE_CAPTION = "phong cách chi tiêu";
