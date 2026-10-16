/**
 * Templated advisory copy — the deterministic "nghĩa là gì + nên làm gì" layer
 * over the rule-based detectors. NO LLM, NO network: a pure map from
 * `(detectorType, magnitudeBand)` to fixed Vietnamese copy plus a P07 navigation
 * intent. Keying to type AND band means the wording reflects the persona's actual
 * facts (a small jump reads differently from a spike), never one-size-fits-all.
 *
 * Every `intentId` is a whitelisted `CopilotIntent` so the "nên làm gì" CTA can
 * only ever deep-link through `resolveIntentRoute` (invariant #2/#3 — guidance +
 * a tappable link, never an executed action). No guarantee/prediction language.
 */

import type { CopilotIntent } from "@/lib/copilot-nav";

/** Magnitude band derived from the detector's own facts (see `brief.ts`). */
export type BriefBand = "low" | "medium" | "high";

export interface AdvisoryCopy {
  /** "Nghĩa là gì" — what the highlight means for the user. */
  meaning: string;
  /** "Nên làm gì" — the CTA label. */
  action: string;
  /** Whitelisted navigation intent for `resolveIntentRoute`. */
  intentId: CopilotIntent;
}

type CopyByBand = Record<BriefBand, AdvisoryCopy>;

const ADVISORY: Record<string, CopyByBand> = {
  spending_spike: {
    low: {
      meaning: "Một nhóm chi tăng nhẹ so với tháng trước, chưa đáng ngại nhưng nên để ý.",
      action: "Xem lại giao dịch nhóm này",
      intentId: "open-transactions",
    },
    medium: {
      meaning: "Một nhóm chi tăng khá rõ so với tháng trước, ảnh hưởng đến dòng tiền tháng này.",
      action: "Rà soát giao dịch để tìm khoản có thể cắt giảm",
      intentId: "open-transactions",
    },
    high: {
      meaning: "Một nhóm chi tăng đột biến so với tháng trước, đây là nguyên nhân chính khiến chi tiêu tăng.",
      action: "Kiểm tra các giao dịch lớn trong nhóm này",
      intentId: "open-transactions",
    },
  },
  jar_pressure: {
    low: {
      meaning: "Một hũ đã dùng gần hết phần chia của tháng.",
      action: "Xem lại phân bổ các hũ",
      intentId: "open-hu",
    },
    medium: {
      meaning: "Một hũ đã vượt phần chia, bạn đang tiêu nhiều hơn dự kiến ở nhóm này.",
      action: "Điều chỉnh lại các hũ cho cân đối",
      intentId: "open-hu",
    },
    high: {
      meaning: "Bạn đã chia hoặc chi vượt số dư đáng kể, cần cân lại để không âm quỹ.",
      action: "Cân lại các hũ ngay",
      intentId: "open-hu",
    },
  },
  budget_pressure: {
    low: {
      meaning: "Một danh mục sắp chạm hạn mức tháng.",
      action: "Theo dõi danh mục này trong hũ",
      intentId: "open-hu",
    },
    medium: {
      meaning: "Một danh mục đã gần hoặc chạm hạn mức tháng.",
      action: "Điều chỉnh chi tiêu cho danh mục này",
      intentId: "open-hu",
    },
    high: {
      meaning: "Một danh mục đã vượt hạn mức tháng.",
      action: "Xem lại hạn mức và chi tiêu trong hũ",
      intentId: "open-hu",
    },
  },
  upcoming_obligation: {
    low: {
      meaning: "Có một khoản sắp đến hạn trong 30 ngày tới.",
      action: "Kiểm tra số dư trong các hũ cho khoản này",
      intentId: "open-hu",
    },
    medium: {
      meaning: "Một khoản đáng kể sắp đến hạn, hãy đảm bảo đủ số dư.",
      action: "Cân lại các hũ để chuẩn bị chi trả",
      intentId: "open-hu",
    },
    high: {
      meaning: "Một khoản lớn sắp đến hạn, có thể ảnh hưởng số dư.",
      action: "Ưu tiên dành số dư trong hũ cho khoản này",
      intentId: "open-hu",
    },
  },
  income_change: {
    low: {
      meaning: "Thu nhập tháng này giảm nhẹ so với tháng trước.",
      action: "Xem lại phân bổ các hũ cho phù hợp",
      intentId: "open-hu",
    },
    medium: {
      meaning: "Thu nhập giảm khá rõ, dòng tiền tháng này eo hẹp hơn.",
      action: "Cân đối lại các hũ cho tháng",
      intentId: "open-hu",
    },
    high: {
      meaning: "Thu nhập giảm mạnh so với tháng trước.",
      action: "Rà soát lại phân bổ chi tiêu trong hũ",
      intentId: "open-hu",
    },
  },
  recurring_summary: {
    low: {
      meaning: "Bạn có một vài khoản chi định kỳ đều đặn mỗi tháng.",
      action: "Rà soát các khoản định kỳ trong hũ",
      intentId: "open-hu",
    },
    medium: {
      meaning: "Các khoản chi định kỳ chiếm một phần dòng tiền mỗi tháng.",
      action: "Xem các khoản định kỳ có thể tối ưu",
      intentId: "open-hu",
    },
    high: {
      meaning: "Các khoản chi định kỳ chiếm phần lớn dòng tiền cố định hằng tháng.",
      action: "Cắt giảm các khoản định kỳ không cần thiết",
      intentId: "open-hu",
    },
  },
};

/** Copy for a detector type + band, or `null` when no template exists. */
export function advisoryFor(type: string, band: BriefBand): AdvisoryCopy | null {
  return ADVISORY[type]?.[band] ?? null;
}
