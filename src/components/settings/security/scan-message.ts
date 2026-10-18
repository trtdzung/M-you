// Rule-based scam check for pasted messages, links or numbers (demo rules). Pure, no React.

export type ScanLevel = "danger" | "suspicious" | "clear";
export type ScanResult = { level: ScanLevel; reasons: string[] };

const OFFICIAL_DOMAIN = "msb.com.vn"; // mock
// mock: obviously fake numbers standing in for a fraud watch list
const WATCHED_NUMBERS = new Set(["0900000001", "0900000002", "0900000003", "9999888877776666"]);

const OTP = /\b(otp|mat khau|ma pin|pin|cccd|can cuoc)\b/;
const URGENT = /\b(gap|ngay|trong \d+ (phut|gio)|het han|bi khoa|bi huy|khan)\b/;
const MONEY = /\b(hoan tien|trung thuong|qua tang|nhan ngay|hoa hong)\b/;
const MENTIONS_MSB = /\bmsb\b/;
const AUTHORITY = /\b(cong an|thue|toa an|vien kiem sat|hai quan)\b/;
const DOMAIN = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})/g;

/** Lowercase without Vietnamese diacritics, since scam SMS are often typed that way. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

function foreignDomains(text: string): string[] {
  const hosts = [...text.matchAll(DOMAIN)].map(match => match[1].replace(/^www\./, ""));
  return [...new Set(hosts)].filter(host => host !== OFFICIAL_DOMAIN && !host.endsWith(`.${OFFICIAL_DOMAIN}`));
}

function hasWatchedNumber(text: string): boolean {
  // Join digits split by spaces, dots or dashes ("090 000 0001").
  const digits = text.replace(/(\d)[\s.-](?=\d)/g, "$1").match(/\d+/g) ?? [];
  return digits.some(number => WATCHED_NUMBERS.has(number));
}

export function scanMessage(text: string): ScanResult {
  const normalized = normalizeText(text);
  const reasons: string[] = [];
  for (const domain of foreignDomains(normalized)) reasons.push(`Tên miền ${domain} không phải tên miền chính thức của MSB.`);
  const asksSecret = OTP.test(normalized);
  if (asksSecret) reasons.push("Tin nhắn yêu cầu mã OTP hoặc mật khẩu. MSB không bao giờ hỏi những thông tin này.");
  if (URGENT.test(normalized)) reasons.push("Tin nhắn giục bạn làm gấp: dấu hiệu thao túng.");
  // No official MSB promotion is running in the demo, so any money promise naming MSB is fake.
  if (MONEY.test(normalized) && MENTIONS_MSB.test(normalized)) reasons.push("MSB không có chương trình này đang chạy.");
  if (AUTHORITY.test(normalized)) reasons.push("Tự xưng là cơ quan nhà nước. Cơ quan nhà nước không yêu cầu chuyển tiền qua tin nhắn.");
  const watched = hasWatchedNumber(text);
  if (watched) reasons.push("Số này nằm trong danh sách cảnh báo (dữ liệu giả lập).");

  const level: ScanLevel = asksSecret || watched || reasons.length >= 2 ? "danger" : reasons.length === 1 ? "suspicious" : "clear";
  return { level, reasons };
}
