/**
 * Copy for the recurring, archetype and closing slides (split out of
 * `wrapped-copy-vi` to stay small). Same rules: neutral tone, unknown never
 * printed as 0, amounts only via `formatWrappedMoney`.
 */

import { ARCHETYPE_FACT_ID } from "./archetype";
import {
  assumptionOf,
  factOf,
  heroPct,
  line,
  makeCopy,
  numOf,
  ranksOf,
  rowLine,
  textOf,
  type WrappedCopyLine,
  type WrappedSlideCopy,
} from "./wrapped-copy-helpers";
import { formatWrappedMoney, UNKNOWN_TEXT, wrappedHeroMoney } from "./wrapped-money-format";
import { formatWrappedCount, formatWrappedPct } from "./wrapped-number-format";
import type { ArchetypeId, WrappedSlide } from "./wrapped-types";

export const CLOSING_CTA = "Đặt hạn mức cho tháng tới";

/** Name + one-line description per archetype; the label is a reference, not a verdict. */
export const ARCHETYPE_COPY: Record<ArchetypeId, { name: string; description: string }> = {
  "steady-planner": {
    name: "Nhà hoạch định ổn định",
    description: "Phần lớn chi tiêu của bạn là các khoản cố định, đều đặn mỗi tháng.",
  },
  "weekend-explorer": {
    name: "Người tận hưởng cuối tuần",
    description: "Chi tiêu của bạn tập trung nhiều hơn vào Thứ bảy và Chủ nhật.",
  },
  balanced: {
    name: "Người cân bằng",
    description: "Chi tiêu của bạn phân bổ khá đều, không nghiêng hẳn về một thói quen nào.",
  },
};

const isArchetypeId = (v: string): v is ArchetypeId => Object.hasOwn(ARCHETYPE_COPY, v);

export function recurringCopy(slide: WrappedSlide, masked: boolean): WrappedSlideCopy {
  const annual = numOf(slide, "recurring-total-annual");
  const total = formatWrappedMoney(annual, masked);
  const lines = [
    line(total === UNKNOWN_TEXT ? "insufficient" : "recurring-total", `Các khoản chi định kỳ của bạn ước tính ${total} mỗi năm`),
  ];
  for (const r of ranksOf(slide, "recurring", "label")) {
    const category = textOf(slide, `recurring.${r}.category`);
    const itemAnnual = formatWrappedMoney(numOf(slide, `recurring.${r}.annual`), masked);
    const label = textOf(slide, `recurring.${r}.label`);
    const text = `${label}${category ? ` (${category})` : ""}: ${itemAnnual}/năm`;
    lines.push(rowLine("recurring-item", text, itemAnnual));
  }
  const money = wrappedHeroMoney(annual, masked);
  return makeCopy({
    title: "Khoản chi định kỳ của bạn",
    lines,
    hero: money ? { ...money, caption: "mỗi năm" } : null,
    footnote: assumptionOf(slide, "recurring-total-annual"),
  });
}

/** One plain sentence per evidence fact the archetype may cite; null for unknown / unrecognised. */
function evidenceLine(slide: WrappedSlide, id: string): string | null {
  const value = numOf(slide, id);
  if (value === null) return null;
  switch (id) {
    case "fixed-share-excl-person":
      return `Chi cố định chiếm ${formatWrappedPct(value)} tổng chi`;
    case "weekend-share-excl-person":
      return `Chi vào cuối tuần chiếm ${formatWrappedPct(value)} tổng chi`;
    case "top3-share":
      return `3 nơi ghé nhiều nhất chiếm ${formatWrappedPct(value)} số lượt chi`;
    case "distinct-merchants":
      return `Bạn đã chi ở ${formatWrappedCount(value)} nơi khác nhau`;
    default:
      return null;
  }
}

export function archetypeCopy(slide: WrappedSlide): WrappedSlideCopy {
  const id = textOf(slide, ARCHETYPE_FACT_ID);
  if (!isArchetypeId(id)) {
    return makeCopy({
      title: "Phong cách chi tiêu",
      lines: [line("insufficient", "Chưa đủ dữ liệu để gợi ý nhãn phù hợp")],
    });
  }
  const { name, description } = ARCHETYPE_COPY[id];
  const evidence = slide.facts
    .filter((f) => f.id !== ARCHETYPE_FACT_ID)
    .map((f) => evidenceLine(slide, f.id))
    .filter((l): l is string => l !== null)
    .map((text) => line("evidence", text));
  return makeCopy({
    title: name,
    lines: [line("description", description), ...evidence],
    footnote: factOf(slide, ARCHETYPE_FACT_ID)?.assumption,
  });
}

export function closingCopy(slide: WrappedSlide): WrappedSlideCopy {
  const quality = numOf(slide, "data-quality");
  const lines: WrappedCopyLine[] = [
    quality === null
      ? line("insufficient", "Chưa đủ dữ liệu để đánh giá mức độ phân loại chi tiêu")
      : line("quality", `${formatWrappedPct(quality)} chi tiêu của bạn đã có danh mục`),
  ];
  const taught = numOf(slide, "taught-count");
  // Only a real, positive count: 0 / unknown would be a hollow or false claim.
  if (taught !== null && taught > 0) {
    lines.push(
      line("taught", `Bạn đã chỉnh danh mục cho ${formatWrappedCount(taught)} giao dịch, giúp ứng dụng hiểu bạn hơn`),
    );
  }
  return makeCopy({
    title: "Một chút nhìn lại",
    lines,
    hero: heroPct(quality, "chi tiêu đã có danh mục"),
    cta: CLOSING_CTA,
  });
}
