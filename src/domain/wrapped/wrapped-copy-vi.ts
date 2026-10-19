/**
 * Vietnamese copy, one small pure function per slide. Tone: neutral/positive, "bạn",
 * no advice, no prediction, no comparison to other users. Every amount goes through
 * `formatWrappedMoney(…, masked)` (D1); an unknown value hides its line or says
 * "Chưa rõ" — never 0. Labels come from facts (invariant #7) and are re-sanitized.
 * Recurring / archetype / closing live in `wrapped-copy-vi-story`.
 */

import { archetypeCopy, closingCopy, recurringCopy } from "./wrapped-copy-vi-story";
import {
  assumptionOf,
  factOf,
  heroCount,
  heroPct,
  line,
  makeCopy,
  numOf,
  ranksOf,
  rowLine,
  textOf,
  type WrappedCopyLine,
  type WrappedHero,
  type WrappedSlideCopy,
} from "./wrapped-copy-helpers";
import { healthCopy } from "./wrapped-copy-vi-health";
import { formatWrappedMoney, UNKNOWN_TEXT, wrappedHeroMoney } from "./wrapped-money-format";
import { formatWrappedCount, formatWrappedPct, monthKeyLabel, weekdayName } from "./wrapped-number-format";
import { WRAPPED_MONTHS } from "./wrapped-thresholds";
import type { WrappedSlide } from "./wrapped-types";

export type { WrappedSlideCopy } from "./wrapped-copy-helpers";

/** One line, always on the opening slide. */
export const WRAPPED_DISCLOSURE =
  "Tổng kết được tạo trên thiết bị từ dữ liệu của bạn; nhãn tính cách chỉ mang tính tham khảo";

/** Lines per ranked list on a slide. */
const JAR_LINES = 4;
const MONTH_SPEND_PREFIX = "month-spend.";

function openingCopy(slide: WrappedSlide): WrappedSlideCopy {
  const months = numOf(slide, "months-with-data");
  const count = numOf(slide, "counted-expense-count");
  const period = factOf(slide, "months-with-data")?.period.label;
  const lines: WrappedCopyLine[] = [];
  if (period) lines.push(line("period", `Giai đoạn ${period}`));
  if (months !== null) lines.push(line("months", `${months}/${WRAPPED_MONTHS} tháng có dữ liệu chi tiêu`));
  if (count !== null) lines.push(line("txn-count", `${formatWrappedCount(count)} giao dịch chi tiêu được tính`));
  return makeCopy({ title: "Tổng kết chi tiêu của bạn", lines, footnote: WRAPPED_DISCLOSURE });
}

function totalSpendCopy(slide: WrappedSlide, masked: boolean): WrappedSlideCopy {
  const months = slide.facts.filter((f) => f.id.startsWith(MONTH_SPEND_PREFIX) && typeof f.value === "number");
  const totalValue = numOf(slide, "total-spend");
  const total = formatWrappedMoney(totalValue, masked);
  const lines = [
    line(total === UNKNOWN_TEXT ? "insufficient" : "total", `Tổng chi trong ${months.length} tháng có dữ liệu: ${total}`),
  ];
  if (months.length > 1) {
    const top = months.reduce((a, b) => ((b.value as number) > (a.value as number) ? b : a));
    const month = monthKeyLabel(top.id.slice(MONTH_SPEND_PREFIX.length));
    lines.push(line("peak-month", `Tháng chi nhiều nhất: ${month} (${formatWrappedMoney(top.value as number, masked)})`));
  }
  // The caption counts the months the series really has data for (never a fixed 6).
  const known = (slide.series ?? []).filter((v) => typeof v === "number" && Number.isFinite(v)).length;
  const money = known > 0 ? wrappedHeroMoney(totalValue, masked) : null;
  const hero: WrappedHero | null = money ? { ...money, caption: `đã chi tiêu trong ${known} tháng qua` } : null;
  return makeCopy({ title: "Bạn đã chi tiêu", lines, hero, footnote: assumptionOf(slide, "total-spend") });
}

function jarShareCopy(slide: WrappedSlide, masked: boolean): WrappedSlideCopy {
  const lines = ranksOf(slide, "jar", "label")
    .slice(0, JAR_LINES)
    .map((r) => {
      const share = formatWrappedPct(numOf(slide, `jar.${r}.share`) ?? "unknown");
      const amount = formatWrappedMoney(numOf(slide, `jar.${r}.amount`), masked);
      return rowLine("jar-row", `${textOf(slide, `jar.${r}.label`)}: ${share} (${amount})`, share, amount);
    });
  const fixed = numOf(slide, "fixed-share");
  if (fixed !== null) lines.push(line("fixed-share", `Chi cố định chiếm ${formatWrappedPct(fixed)} tổng chi`));
  return makeCopy({
    title: "Tiền của bạn đi đâu",
    lines,
    hero: heroPct(numOf(slide, "jar.1.share"), textOf(slide, "jar.1.label")),
    footnote: fixed !== null ? assumptionOf(slide, "fixed-share") : undefined,
  });
}

function topMerchantsCopy(slide: WrappedSlide, masked: boolean): WrappedSlideCopy {
  const lines = ranksOf(slide, "merchant", "name").map((r) => {
    const visits = numOf(slide, `merchant.${r}.visits`);
    const spend = formatWrappedMoney(numOf(slide, `merchant.${r}.spend`), masked);
    const visitText = visits === null ? "" : `${formatWrappedCount(visits)} lượt, `;
    const text = `${r}. ${textOf(slide, `merchant.${r}.name`)}: ${visitText}${spend}`;
    return rowLine("merchant-row", text, spend, visits === null ? UNKNOWN_TEXT : "");
  });
  const distinct = numOf(slide, "distinct-merchants");
  if (distinct !== null) lines.push(line("distinct", `Bạn đã chi ở ${formatWrappedCount(distinct)} nơi khác nhau`));
  const top3 = numOf(slide, "top3-share");
  if (top3 !== null) lines.push(line("top3", `3 nơi ghé nhiều nhất chiếm ${formatWrappedPct(top3)} số lượt chi`));
  return makeCopy({
    title: "Những nơi bạn ghé thường xuyên",
    lines,
    hero: heroCount(distinct, "nơi khác nhau"),
    footnote: "Chỉ tính chi tiêu không cố định; không gồm chuyển khoản cho cá nhân",
  });
}

function habitsCopy(slide: WrappedSlide, masked: boolean): WrappedSlideCopy {
  const lines: WrappedCopyLine[] = [];
  const peak = numOf(slide, "peak-weekday");
  const peakName = peak === null ? null : weekdayName(peak);
  if (peak !== null && peakName !== null) {
    const spend = formatWrappedMoney(numOf(slide, `weekday.${peak}.spend`), masked);
    lines.push(rowLine("peak-day", `Bạn chi nhiều nhất vào ${peakName} (${spend})`, spend));
  }
  const weekend = numOf(slide, "weekend-share");
  if (weekend !== null) lines.push(line("weekend", `Cuối tuần chiếm ${formatWrappedPct(weekend)} tổng chi`));
  return makeCopy({
    title: "Nhịp chi tiêu theo tuần",
    lines,
    hero: heroPct(weekend, "chi vào cuối tuần"),
    footnote: "Thứ trong tuần theo lịch Việt Nam; cuối tuần là Thứ bảy và Chủ nhật",
  });
}

/** Copy for one slide; `masked` hides every amount in title, body, footnote and `srText`. */
export function copyForSlide(slide: WrappedSlide, masked: boolean): WrappedSlideCopy {
  switch (slide.id) {
    case "opening":
      return openingCopy(slide);
    case "total-spend":
      return totalSpendCopy(slide, masked);
    case "jar-share":
      return jarShareCopy(slide, masked);
    case "top-merchants":
      return topMerchantsCopy(slide, masked);
    case "habits":
      return habitsCopy(slide, masked);
    case "recurring":
      return recurringCopy(slide, masked);
    case "archetype":
      return archetypeCopy(slide);
    case "health":
      return healthCopy(slide);
    case "closing":
      return closingCopy(slide);
  }
}
