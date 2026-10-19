/**
 * Copy for the health slide. Same rules as the other slides: neutral tone, no
 * advice, an unknown pillar says "Chưa rõ" (never 0). Scores are points, not
 * money, so masking does not apply. Tier and pillar names match the Home sheet.
 */

import type { HealthPillar, HealthTier } from "@/domain/models/health-score";
import { HEALTH_PILLARS } from "./facts-health";
import {
  assumptionOf,
  line,
  makeCopy,
  numOf,
  rowLine,
  textOf,
  type WrappedCopyLine,
  type WrappedHero,
  type WrappedSlideCopy,
} from "./wrapped-copy-helpers";
import { formatWrappedPct, UNKNOWN_TEXT } from "./wrapped-number-format";
import type { WrappedSlide } from "./wrapped-types";

export const HEALTH_TIER_COPY: Record<HealthTier, string> = {
  healthy: "Lành mạnh",
  coping: "Trung bình",
  vulnerable: "Cần lưu ý",
};

export const HEALTH_PILLAR_COPY: Record<HealthPillar, string> = {
  SPEND: "Chi tiêu",
  SAVE: "Tiết kiệm",
  BORROW: "Nghĩa vụ nợ",
  PLAN_PROTECT: "Dự phòng & Kế hoạch",
};

const isTier = (v: string): v is HealthTier => Object.hasOwn(HEALTH_TIER_COPY, v);

/** "72/100", or "Chưa rõ" for a missing score. */
export function formatHealthScore(value: number | null): string {
  return value === null ? UNKNOWN_TEXT : `${Math.round(value)}/100`;
}

export function healthCopy(slide: WrappedSlide): WrappedSlideCopy {
  const score = numOf(slide, "health-score");
  const tierId = textOf(slide, "health-tier");
  const tier = isTier(tierId) ? HEALTH_TIER_COPY[tierId] : null;
  const lines: WrappedCopyLine[] = [
    score === null
      ? line("insufficient", "Chưa đủ dữ liệu để tính điểm sức khỏe tài chính")
      : line("health-score", `Điểm sức khỏe tài chính: ${formatHealthScore(score)}${tier ? ` (${tier})` : ""}`),
  ];
  for (const pillar of HEALTH_PILLARS) {
    const text = formatHealthScore(numOf(slide, `health-pillar.${pillar}`));
    lines.push(rowLine("health-pillar", `${HEALTH_PILLAR_COPY[pillar]}: ${text}`, text));
  }
  const coverage = numOf(slide, "health-coverage");
  if (coverage !== null) lines.push(line("health-coverage", `Độ phủ dữ liệu ${formatWrappedPct(coverage)}`));

  const rounded = score === null ? null : Math.round(score);
  const hero: WrappedHero | null =
    rounded === null
      ? null
      : { value: String(rounded), unit: "/100", caption: tier ?? "điểm sức khỏe tài chính", countTo: { to: rounded, decimals: 0 } };
  return makeCopy({
    title: "Sức khỏe tài chính của bạn",
    lines,
    hero,
    footnote: assumptionOf(slide, "health-score"),
  });
}
