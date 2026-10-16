/**
 * Local heuristic for TRANSFER PURPOSE — a tiny keyword table over the memo
 * ("Nội dung") and recipient name, so dev/test/offline still produce a guess
 * with no network and no model. Not AI (callers tag it `origin:"heuristic"`).
 *
 * Fixed LOW confidence ⇒ always lands as a `pending` suggestion (a heuristic
 * guess about where money went is never trusted enough to auto-apply). Unknown
 * transfers get NO result — we never fabricate a purpose (and never default to
 * "other", which would be noise the user must undo).
 */

import type { ClassifyFn, ClassifyResult } from "@/ai/categorize/types";

const PURPOSE_CONFIDENCE = 0.5;

/** memo/recipient keyword → purposeId. First match wins (order matters). */
const PURPOSE_RULES: [string, string][] = [
  ["tra no", "debt"],
  ["tra goc", "debt"],
  ["vay", "debt"],
  ["tiet kiem", "savings"],
  ["dau tu", "savings"],
  ["tien nha", "rent"],
  ["thue nha", "rent"],
  ["tien tro", "rent"],
  ["phong tro", "rent"],
  ["chia tien", "bill_split"],
  ["tien an", "bill_split"],
  ["tien com", "bill_split"],
  ["lien hoan", "bill_split"],
  ["mua hang", "pay_goods"],
  ["don hang", "pay_goods"],
  ["thanh toan", "pay_goods"],
  ["kinh doanh", "business"],
  ["cong ty", "business"],
  ["gia dinh", "family"],
  ["bo me", "family"],
  ["li xi", "gift"],
  ["mung tuoi", "gift"],
  ["qua tang", "gift"],
  ["sinh nhat", "gift"],
];

/** Match memo + recipient to a purpose id, or `undefined`. */
export function heuristicPurpose(merchant: string, note?: string): string | undefined {
  const hay = `${note ?? ""} ${merchant}`.toLowerCase();
  for (const [needle, purposeId] of PURPOSE_RULES) {
    if (hay.includes(needle)) return purposeId;
  }
  return undefined;
}

/** The heuristic purpose `ClassifyFn`. Unknown transfers yield nothing. */
export const localPurposeClassify: ClassifyFn = async (inputs) => {
  const out: ClassifyResult[] = [];
  for (const input of inputs) {
    const purposeId = heuristicPurpose(input.merchant, input.note);
    if (purposeId) out.push({ txnId: input.txnId, categoryId: purposeId, confidence: PURPOSE_CONFIDENCE });
  }
  return out;
};
