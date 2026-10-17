import type { ProactiveCandidate } from "./core";

export interface WidgetCopy { title: string; body: string }
export interface ProductOption {
  id: "m_sinh_loi" | "msb_certificate";
  name: string;
  description: string;
  href: string;
}
export interface InsightWidgetDto {
  id: string;
  version: number;
  insightType: string;
  priorityClass: ProactiveCandidate["priorityClass"];
  severity: ProactiveCandidate["severity"];
  title: string;
  body: string;
  period: string;
  metricLabel: string;
  metricValue: number;
  metricUnit: "VND";
  detailLabel: string;
  actionLabel: string;
  actionHref: string;
  source: string;
  asOf: string | null;
  productOptions?: ProductOption[];
}

const PRODUCT_OPTIONS: Record<ProductOption["id"], ProductOption> = {
  m_sinh_loi: {
    id: "m_sinh_loi", name: "M–Sinh lời",
    description: "Tìm hiểu cơ chế chuyển phần vượt ngưỡng và điều khoản hợp đồng với SBSI.",
    href: "https://www.msb.com.vn/khach-hang-ca-nhan/dau-tu/m-sinh-loi/",
  },
  msb_certificate: {
    id: "msb_certificate", name: "Chứng chỉ tiền gửi tài khoản MSB",
    description: "Tìm hiểu kỳ hạn, điều kiện tham gia và cách chuyển nhượng trước hạn.",
    href: "https://www.msb.com.vn/khach-hang-ca-nhan/dau-tu/sinh-loi-khong-ngung-cung-tai-khoan-msb/",
  },
};

/** Numeric values live only in structured metrics, never inside reusable prose. */
export function deterministicCopy(candidate: ProactiveCandidate): WidgetCopy {
  if (candidate.insightType === "safe_surplus_products") return {
    title: "Có khoản tiền có thể cân nhắc sinh lời",
    body: "Sau khi giữ lại tiền cho hũ, khoản trả nợ, mục tiêu và dự phòng, bạn có thể tìm hiểu các lựa chọn của MSB.",
  };
  if (candidate.insightType === "jar_plan_pressure") {
    if (candidate.semanticState === "needs_cover") return {
      title: "Hũ cần được bù thêm",
      body: "Số còn lại trong hũ đang âm. Hãy xem lại chi tiêu và điều chỉnh hũ nếu phù hợp.",
    };
    if (candidate.semanticState === "over_limit_covered") return {
      title: "Hũ đã vượt hạn mức",
      body: "Chi tiêu đã vượt kế hoạch của hũ dù số còn lại đã được bù. Hãy xem lại ngân sách.",
    };
    return {
      title: "Hũ sắp chạm hạn mức",
      body: "Chi tiêu trong hũ đang gần mức bạn đặt cho tháng này. Hãy xem lại các khoản đã chi.",
    };
  }
  return {
    title: "Chi tiêu danh mục tăng",
    body: "Chi tiêu danh mục này tăng so với tháng trước. Hãy xem lại các giao dịch liên quan.",
  };
}

function numericMetric(candidate: ProactiveCandidate, key: string): number {
  const value = candidate.metrics[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`invalid metric: ${key}`);
  return value;
}

export function toWidgetDto(candidate: ProactiveCandidate, copy: WidgetCopy, version: number): InsightWidgetDto {
  const jar = candidate.insightType === "jar_plan_pressure";
  const opportunity = candidate.insightType === "safe_surplus_products";
  const label = candidate.metrics[jar ? "jar_label" : "category_label"];
  const source = candidate.metrics.source;
  const freshness = candidate.metrics.freshness;
  return {
    id: candidate.id,
    version,
    insightType: candidate.insightType,
    priorityClass: candidate.priorityClass,
    severity: candidate.severity,
    title: copy.title,
    body: copy.body,
    period: candidate.period,
    metricLabel: opportunity ? "Có thể cân nhắc" : jar ? "Còn lại trong hũ" : "Tăng so với tháng trước",
    metricValue: numericMetric(candidate, opportunity ? "safe_surplus" : jar ? "remaining" : "increase"),
    metricUnit: "VND",
    detailLabel: opportunity ? "Sau phần tiền đã giữ lại" : typeof label === "string" ? label : "Danh mục",
    actionLabel: opportunity ? "Xem tổng quan" : jar ? "Xem hũ chi tiêu" : "Xem chi tiêu",
    actionHref: opportunity ? "/pfm?tab=overview" : jar ? "/pfm?tab=budget" : "/pfm?tab=transactions",
    source: typeof source === "string" ? source : "unknown",
    asOf: typeof freshness === "string" ? freshness : null,
    ...(opportunity ? { productOptions: String(candidate.metrics.product_ids ?? "").split(",")
      .filter((id): id is ProductOption["id"] => id === "m_sinh_loi" || id === "msb_certificate")
      .map((id) => PRODUCT_OPTIONS[id]) } : {}),
  };
}
