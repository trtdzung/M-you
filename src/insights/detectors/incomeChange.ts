import type { Detector } from "../types";
import { buildInsight, fact, money, pctChange, prevLabel } from "../narrate";

/** Flags a material month-over-month change in income (>= 15%). */
export const incomeChange: Detector = (f) => {
  const cur = f.cashflow.income;
  const prev = f.prevCashflow.income;
  if (prev <= 0) return null;

  const pct = pctChange(cur, prev);
  if (Math.abs(pct) < 15) return null;

  const down = pct < 0;
  const delta = Math.abs(cur - prev);
  return buildInsight({
    id: `incomeChange:${f.monthKey}`,
    type: "income_change",
    severity: down ? "attention" : "info",
    title: down ? "Thu nhập giảm" : "Thu nhập tăng",
    explanation: `Thu nhập tháng này là ${money(cur)}, ${down ? "giảm" : "tăng"} ${money(delta)} (${Math.abs(pct)}%) so với ${prevLabel(f.monthKey)}.`,
    facts: [
      fact("Thu nhập tháng này", cur),
      fact("Thu nhập tháng trước", prev),
      fact("Chênh lệch", delta),
    ],
    comparisonPeriod: prevLabel(f.monthKey),
    confidence: 0.9,
  });
};
