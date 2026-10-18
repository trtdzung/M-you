// Scam Shield alert level for a transfer about to be confirmed (demo rules).
// Pure: no React, no store. M-You (MSB's AI assistant) only warns; it never
// blocks money on its own.

import { normalizeText } from "@/components/settings/security/scan-message";
import { TRANSFER_THRESHOLD_VND, hitsThreshold } from "@/lib/transfer-risk";

export type TransferAlertLevel = "green" | "yellow" | "red";
export type TransferAlert = { level: TransferAlertLevel; reasons: string[] };

export type TransferAlertInput = {
  amount: number;
  isNewPayee: boolean;
  recipientName: string;
  /** Full or masked ("••• 1234"); only the last 4 digits are compared. */
  recipientAccount?: string;
  memo: string | null;
  postedAt: Date;
  aiProtect: boolean;
  trusted: { name: string; account: string }[];
};

const VN_OFFSET_HOURS = 7;
const NAME_SPOOF = "Tên giống người quen, khác số tài khoản";

// demo rules: authority / OTP words scammers use, matched on normalized text.
// "thue" alone is also "thuê" (rent), so common rent memos are excluded.
const AUTHORITY_WORDS: { label: string; pattern: RegExp }[] = [
  { label: "thuế", pattern: /\bthue\b(?!\s*(nha|phong|tro|xe|mat bang))/ },
  { label: "công an", pattern: /\bcong an\b/ },
  { label: "tòa án", pattern: /\btoa an\b/ },
  { label: "hải quan", pattern: /\bhai quan\b/ },
  { label: "OTP", pattern: /\botp\b/ },
  { label: "phong tỏa", pattern: /\bphong toa\b/ },
  { label: "điều tra", pattern: /\bdieu tra\b/ },
];

const normalizeName = (name: string) => normalizeText(name).replace(/\s+/g, " ").trim();
/** Last 4 digits of a full or masked account, or null when there are fewer. */
export function accountLastFour(account: string | undefined): string | null {
  const digits = (account ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
const lastFour = accountLastFour;

/** Same normalized name and same last 4 account digits as a trusted contact. */
export function isTrustedRecipient(trusted: TransferAlertInput["trusted"], name: string, account: string | undefined): boolean {
  const key = normalizeName(name);
  const digits = lastFour(account);
  return digits !== null && trusted.some(contact => normalizeName(contact.name) === key && lastFour(contact.account) === digits);
}

/** Hour of day in Vietnam (UTC+7). */
function vnHour(at: Date): number {
  return (at.getUTCHours() + VN_OFFSET_HOURS) % 24;
}

function authorityWords(memo: string | null): string[] {
  if (!memo) return [];
  // Written with diacritics as "thuê" (rent) and not "thuế" (tax): not a tax word.
  const rentOnly = /thuê/i.test(memo) && !/thuế/i.test(memo);
  const text = normalizeText(memo).replace(/\s+/g, " ");
  return AUTHORITY_WORDS.filter(word => !(rentOnly && word.label === "thuế") && word.pattern.test(text)).map(word => word.label);
}

export function transferAlertLevel(input: TransferAlertInput): TransferAlert {
  // M-You off → no warning. MSB's own mandatory holds are out of demo scope.
  if (!input.aiProtect) return { level: "green", reasons: [] };

  const name = normalizeName(input.recipientName);
  const account = lastFour(input.recipientAccount);
  const sameName = input.trusted.filter(contact => normalizeName(contact.name) === name);
  if (isTrustedRecipient(input.trusted, input.recipientName, input.recipientAccount)) return { level: "green", reasons: [] };

  // Same name as a trusted contact but a known, different account: likely impersonation.
  const nameSpoof = account !== null && sameName.some(contact => lastFour(contact.account) !== null);
  const words = authorityWords(input.memo);
  const reasons: string[] = [];
  if (nameSpoof) reasons.push(NAME_SPOOF);
  if (input.isNewPayee) reasons.push("Người nhận mới");
  if (hitsThreshold(input.amount)) reasons.push(`Số tiền từ ${TRANSFER_THRESHOLD_VND / 1_000_000} triệu đồng trở lên`);
  const hour = vnHour(input.postedAt);
  if (hour >= 23 || hour < 5) reasons.push("Chuyển khoản lúc nửa đêm (23:00–05:00)");
  if (words.length > 0) reasons.push(`Nội dung có chữ ${words.map(word => `"${word}"`).join(", ")}`);

  const level: TransferAlertLevel = nameSpoof || words.length > 0 || reasons.length >= 3 ? "red" : reasons.length > 0 ? "yellow" : "green";
  return { level, reasons };
}
