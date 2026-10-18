// Classifies what the customer pasted into "Kiểm tra tin nhắn lạ" and phrases the question M-You gets. Pure, no React.

export type ScanInputKind = "link" | "phone" | "account" | "message";

const URL_LIKE = /^(?:https?:\/\/|www\.)\S+$/i;
const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#]\S*)?$/i;
const VN_MOBILE = /^(?:0|\+?84)\d{9}$/;
const HOTLINE = /^1[89]00\d{4}$/;
const DIGITS = /^\d{6,19}$/;

export function classifyScanInput(text: string): ScanInputKind {
  const value = text.trim();
  if (!/\s/.test(value) && (URL_LIKE.test(value) || BARE_DOMAIN.test(value))) return "link";
  const compact = value.replace(/[\s.\-()]/g, "");
  if (VN_MOBILE.test(compact) || HOTLINE.test(compact)) return "phone";
  if (DIGITS.test(compact)) return "account";
  return "message";
}

export const SCAN_KIND_LABEL: Record<ScanInputKind, string> = {
  link: "link", phone: "số điện thoại", account: "tài khoản", message: "tin nhắn",
};

export function buildScanPrompt(text: string): string {
  const value = text.trim();
  return `Kiểm tra bảo mật cho ${SCAN_KIND_LABEL[classifyScanInput(value)]} sau: ${value}`;
}
