// Scam Shield alert level for a transfer about to be confirmed. Rules follow the
// "AI Agent Fraud" spec (signals T1, T1b, T3, T8 and the level table); signals
// the prototype has no data for (T2, T4–T7, screen sharing) are not judged.
// Pure: no React, no store. M-You (MSB's AI assistant) only warns; it never
// blocks money on its own.

import { normalizeText } from "@/components/settings/security/scan-message";
import type { Transaction } from "@/domain/models";
import { findBankByName } from "@/lib/transfer-banks";

export type TransferAlertLevel = "green" | "yellow" | "red";
export type TransferAlert = { level: TransferAlertLevel; reasons: string[] };

/** Someone the customer already knows: a trusted contact or a past transfer recipient. */
export type KnownRecipient = { name: string; account: string; bank?: string };

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

const VN_OFFSET_HOURS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Reference thresholds from the spec (configurable there; constants here).
export const ALERT_RULES = {
  /** T3: amount at least this many times the largest outgoing payment in 90 days. */
  largestOutflowMultiple: 3,
  /** T3: amount at least this share of the source balance. */
  balanceShare: 0.5,
  historyDays: 90,
  /** T8: night window in Vietnam time, [start, end) wrapping midnight. */
  nightStartHour: 23,
  nightEndHour: 1,
} as const;

// T8 memo keywords from the spec, matched on normalized (no-accent) text.
// "thue" alone is also "thuê" (rent), so common rent memos are excluded.
const RISK_WORDS: { label: string; pattern: RegExp }[] = [
  { label: "thuế", pattern: /\bthue\b(?!\s*(nha|phong|tro|xe|mat bang))/ },
  { label: "phạt", pattern: /\bphat\b/ },
  { label: "tài khoản an toàn", pattern: /\btai khoan an toan\b/ },
  { label: "nhiệm vụ", pattern: /\bnhiem vu\b/ },
  { label: "gấp", pattern: /\bgap\b/ },
];

const normalizeName = (name: string) => normalizeText(name).replace(/\s+/g, " ").trim();
/** Banks differ only when both are known banks; a missing or unrecognized name ("Chưa rõ ngân hàng") never counts as different. */
function sameBank(a: string | undefined, b: string | undefined): boolean {
  const left = findBankByName(a);
  const right = findBankByName(b);
  return !left || !right || left.id === right.id;
}

/** Last 4 digits of a full or masked account, or null when there are fewer. */
export function accountLastFour(account: string | undefined): string | null {
  const digits = (account ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
const lastFour = accountLastFour;

/** Same normalized name, same last 4 account digits and (when both are known) same bank as a trusted contact. */
export function isTrustedRecipient(trusted: TransferAlertInput["trusted"], name: string, account: string | undefined, bank?: string): boolean {
  const key = normalizeName(name);
  const digits = lastFour(account);
  return digits !== null && trusted.some(contact => normalizeName(contact.name) === key && lastFour(contact.account) === digits && sameBank(contact.bank, bank));
}

/** Hour of day in Vietnam (UTC+7). */
function vnHour(at: Date): number {
  return (at.getUTCHours() + VN_OFFSET_HOURS) % 24;
}

function isNight(at: Date): boolean {
  const hour = vnHour(at);
  return hour >= ALERT_RULES.nightStartHour || hour < ALERT_RULES.nightEndHour;
}

function riskWords(memo: string | null): string[] {
  if (!memo) return [];
  // Written with diacritics as "thuê" (rent) and not "thuế" (tax): not a tax word.
  const rentOnly = /thuê/i.test(memo) && !/thuế/i.test(memo);
  const text = normalizeText(memo).replace(/\s+/g, " ");
  return RISK_WORDS.filter(word => !(rentOnly && word.label === "thuế") && word.pattern.test(text)).map(word => word.label);
}

/**
 * Past recipients and the largest outgoing payment in the last 90 days, from the
 * customer's own history. Pending, reversed and internal transfers are skipped.
 */
export function transferHistory(transactions: Transaction[], now: Date): { pastRecipients: KnownRecipient[]; largestOutflow90d: number | null } {
  const since = now.getTime() - ALERT_RULES.historyDays * DAY_MS;
  const pastRecipients: KnownRecipient[] = [];
  let largest: number | null = null;
  for (const txn of transactions) {
    if (txn.direction !== "debit" || txn.status !== "posted" || txn.transferGroupId) continue;
    if (txn.type === "transfer" && txn.counterpartyAccountNumber) {
      pastRecipients.push({ name: txn.merchantName, account: txn.counterpartyAccountNumber, bank: txn.counterpartyBankName });
    }
    const at = Date.parse(txn.postedAt);
    if (at >= since && at <= now.getTime()) largest = Math.max(largest ?? 0, txn.amount);
  }
  return { pastRecipients, largestOutflow90d: largest };
}

export function transferAlertLevel(input: TransferAlertInput): TransferAlert {
  // M-You off → no warning. MSB's own mandatory holds are out of demo scope.
  if (!input.aiProtect) return { level: "green", reasons: [] };
  if (isTrustedRecipient(input.trusted, input.recipientName, input.recipientAccount, input.recipientBank)) return { level: "green", reasons: [] };

  const name = normalizeName(input.recipientName);
  const account = lastFour(input.recipientAccount);
  const known = [...input.trusted, ...(input.pastRecipients ?? [])];
  const sameName = known.filter(person => normalizeName(person.name) === name && lastFour(person.account) !== null);
  const sameAccount = sameName.some(person => lastFour(person.account) === account && sameBank(person.bank, input.recipientBank));

  // T1: never paid before and not a trusted contact.
  const t1 = input.isNewPayee && !sameAccount;
  // T1b: same name as someone known, but a different account or bank.
  const t1b = account !== null && sameName.length > 0 && !sameAccount;
  // T3: unusually large, against the customer's own history or balance. Unknown data never fires it.
  const vsLargest = input.largestOutflow90d != null && input.largestOutflow90d > 0 && input.amount >= ALERT_RULES.largestOutflowMultiple * input.largestOutflow90d;
  const vsBalance = input.balance != null && input.balance > 0 && input.amount >= ALERT_RULES.balanceShare * input.balance;
  const t3 = vsLargest || vsBalance;
  // T8: context that only raises an existing Yellow.
  const night = isNight(input.postedAt);
  const words = riskWords(input.memo);
  const t8 = night || words.length > 0;

  // Spec levels: Yellow = T1b, or T1 + T3. Red = any Yellow + T8. Anything else is Green.
  const yellow = t1b || (t1 && t3);
  if (!yellow) return { level: "green", reasons: [] };

  const reasons: string[] = [];
  if (t1b) reasons.push("Tên giống người quen, khác số tài khoản hoặc ngân hàng");
  if (t1) reasons.push("Người nhận mới");
  if (vsLargest) reasons.push(`Số tiền gấp ${ALERT_RULES.largestOutflowMultiple} lần giao dịch lớn nhất trong ${ALERT_RULES.historyDays} ngày`);
  if (vsBalance) reasons.push(`Số tiền từ ${ALERT_RULES.balanceShare * 100}% số dư trở lên`);
  if (night) reasons.push("Chuyển khoản lúc nửa đêm (23:00–01:00)");
  if (words.length > 0) reasons.push(`Nội dung có chữ ${words.map(word => `"${word}"`).join(", ")}`);
  return { level: t8 ? "red" : "yellow", reasons };
}
