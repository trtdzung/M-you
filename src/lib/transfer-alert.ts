// Scam Shield alert level for a transfer about to be confirmed — the confirm
// screen's original rule (T1, T1b, T3, T8 and the level table), now computed
// by the signal engine (`src/lib/security/signals.ts`). Kept as a wrapper so
// its callers and results do not change until the confirm screen moves to the
// engine. Pure: no React, no store. M-You (MSB's AI assistant) only warns; it
// never blocks money on its own.

import { ALERT_RULES, computeSignals, type KnownRecipient, type SignalContext } from "@/lib/security/signals";

export { ALERT_RULES, accountLastFour, isTrustedRecipient, transferHistory, type KnownRecipient } from "@/lib/security/signals";

export type TransferAlertLevel = "green" | "yellow" | "red";
export type TransferAlert = { level: TransferAlertLevel; reasons: string[] };

export type TransferAlertInput = {
  amount: number;
  isNewPayee: boolean;
  recipientName: string;
  /** Full or masked ("••• 1234"); only the last 4 digits are compared. */
  recipientAccount?: string;
  recipientBank?: string;
  memo: string | null;
  postedAt: Date;
  aiProtect: boolean;
  trusted: KnownRecipient[];
  /** Past transfer recipients (T1/T1b). Omitted = none known. */
  pastRecipients?: KnownRecipient[];
  /** Largest outgoing payment in the last 90 days (T3); null/omitted = unknown. */
  largestOutflow90d?: number | null;
  /** Source account balance (T3); null/omitted = unknown. */
  balance?: number | null;
};

export function transferAlertLevel(input: TransferAlertInput): TransferAlert {
  const signals = computeSignals(input satisfies SignalContext);
  const has = (code: string) => signals.find(s => s.code === code);
  const t1 = !!has("T1");
  const t1b = !!has("T1b");
  const t3 = has("T3");
  const t8 = has("T8");

  // Spec levels: Yellow = T1b, or T1 + T3. Red = any Yellow + T8. Anything else is Green.
  const yellow = t1b || (t1 && !!t3);
  if (!yellow) return { level: "green", reasons: [] };

  const words = typeof t8?.facts.words === "string" && t8.facts.words ? t8.facts.words.split(",") : [];
  const reasons: string[] = [];
  if (t1b) reasons.push("Tên giống người quen, khác số tài khoản hoặc ngân hàng");
  if (t1) reasons.push("Người nhận mới");
  if (t3?.facts.vsLargest) reasons.push(`Số tiền gấp ${ALERT_RULES.largestOutflowMultiple} lần giao dịch lớn nhất trong ${ALERT_RULES.historyDays} ngày`);
  if (t3?.facts.vsBalance) reasons.push(`Số tiền từ ${ALERT_RULES.balanceShare * 100}% số dư trở lên`);
  if (t8?.facts.night) reasons.push("Chuyển khoản lúc nửa đêm (23:00–01:00)");
  if (words.length > 0) reasons.push(`Nội dung có chữ ${words.map(word => `"${word}"`).join(", ")}`);
  return { level: t8 ? "red" : "yellow", reasons };
}
