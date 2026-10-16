/**
 * Deterministic field extraction for a transfer request (Level 3, EPIC-13).
 *
 * SAFETY: transfer fields are parsed HERE, in pure code — never filled by the
 * LLM. This is what keeps a prompt-injected model from inventing an amount or a
 * recipient. Missing fields stay `null`; the pipeline asks the user rather than
 * guessing. This module reads text only; it resolves nothing and moves nothing.
 */

export interface ParsedAction {
  /** Amount in VND, or null when not confidently parseable. */
  amount: number | null;
  /** Free-text recipient hint (name or account number the user gave), or null. */
  recipientHint: string | null;
  /** Transfer memo/note, or null. */
  memo: string | null;
  /** True when the message uses urgency language (a fraud heuristic input). */
  urgency: boolean;
}

const URGENCY_RE = /gấp|ngay(?:\s+lập\s+tức)?|khẩn|nhanh\s+lên|nhanh\s+giúp|liền|lập\s+tức|kịp/i;

/** Parse a "5tr" / "5 triệu" / "5,5tr" style amount → VND. */
function parseAmount(text: string): number | null {
  const t = text.toLowerCase();

  const million = t.match(/(\d+(?:[.,]\d+)?)\s*(?:tr(?:iệu)?|triệu|m)\b/);
  if (million) return Math.round(parseFloat(million[1].replace(",", ".")) * 1_000_000);

  const thousand = t.match(/(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn|ng)\b/);
  if (thousand) return Math.round(parseFloat(thousand[1].replace(",", ".")) * 1_000);

  // "5.000.000" — dot/space grouped thousands (3-digit groups).
  const grouped = t.match(/(\d{1,3}(?:[.\s]\d{3})+)/);
  if (grouped) return parseInt(grouped[1].replace(/[.\s]/g, ""), 10);

  // Bare number followed by a currency marker, e.g. "5000000 đ". Use a Unicode-
  // safe boundary: ASCII \b fails after the non-ASCII "đ"/"₫".
  const withUnit = t.match(/(\d{4,})\s*(?:đồng|vnd|₫|đ)(?=$|[^\p{L}])/u);
  if (withUnit) return parseInt(withUnit[1], 10);

  return null;
}

// Account number introduced by a preposition / "STK" (8–19 digits, dot-grouped ok).
const TYPED_ACCT_RE = /((?:cho|tới|đến|sang|stk|số\s*tk|tài\s*khoản)\s*[:]?\s*)(\d[\d.]{7,}\d)/i;

/**
 * Blank out a preposition-introduced account number so its dot-grouped digits are
 * never mis-read as the amount (e.g. "chuyển cho 123.456.789 5.000.000" — the
 * account is not the amount). Keeps the preposition, drops only the digits.
 */
function stripTypedAccount(text: string): string {
  return text.replace(TYPED_ACCT_RE, "$1");
}

/** Extract the recipient hint: a typed account number, or a name after "cho/tới/đến/sang". */
function parseRecipient(text: string): string | null {
  // An account number introduced by a preposition / "STK" wins (not the amount).
  const acctAfter = text.match(TYPED_ACCT_RE);
  if (acctAfter) {
    const digits = acctAfter[2].replace(/[.]/g, "");
    if (/^\d{8,19}$/.test(digits)) return digits;
  }

  // Name after a directional preposition, stopped by an amount or a connective
  // word (so trailing instruction text is never absorbed into the name).
  const m = text.match(
    /(?:cho|tới|đến|sang)\s+([\p{L}][\p{L}\s.]*?)(?=\s+(?:\d|và|rồi|xong|sau|đọc|gửi|kèm|nhé|giúp|với|luôn|ngay|gấp|khẩn|liền|số\s+tiền|nội\s+dung|memo|lời\s+nhắn|thực\s+hiện|xác\s+nhận|tắt|bỏ\s+qua)|[,.!?]|$)/iu,
  );
  if (m) {
    const name = m[1].trim();
    if (name && !/^\d+$/.test(name)) return name;
  }
  return null;
}

/** Extract a memo after "nội dung" / "memo" / "lời nhắn" / "ghi chú". */
function parseMemo(text: string): string | null {
  const m = text.match(/(?:nội\s+dung|memo|lời\s+nhắn|ghi\s+chú)\s*[:\-]?\s*["“]?([^"”\n]+)["”]?$/iu);
  if (m) {
    const memo = m[1].trim();
    return memo || null;
  }
  return null;
}

export function parseAction(text: string): ParsedAction {
  const t = text ?? "";
  return {
    // Parse the amount from text with any typed account number removed, so a
    // dot-grouped account is never mistaken for the amount.
    amount: parseAmount(stripTypedAccount(t)),
    recipientHint: parseRecipient(t),
    memo: parseMemo(t),
    urgency: URGENCY_RE.test(t),
  };
}
