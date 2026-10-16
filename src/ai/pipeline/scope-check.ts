/**
 * Consent/scope gate. An intent may only run if its required data scopes were
 * granted. Denials return a polite Vietnamese reason and never leak the data
 * behind the missing scope.
 */

import type { ConsentScope } from "@/lib/consent";
import type { Intent } from "./intent";

export interface ScopeCheck {
  ok: boolean;
  missing: ConsentScope[];
  reason?: string;
}

const SCOPE_LABEL: Record<ConsentScope, string> = {
  transactions: "giao dịch",
  assets: "tài sản",
  liabilities: "khoản nợ",
  ai: "trợ lý AI",
};

export function ensureScopes(intent: Intent, granted: ConsentScope[]): ScopeCheck {
  const need = new Set<ConsentScope>([...intent.needsScopes, "ai"]);
  const missing = [...need].filter((s) => !granted.includes(s));
  if (missing.length === 0) return { ok: true, missing: [] };
  const labels = missing.map((s) => SCOPE_LABEL[s]).join(", ");
  return {
    ok: false,
    missing,
    reason: `Mình cần quyền truy cập ${labels} để trả lời câu này. Bạn có thể cấp quyền trong phần Đồng ý chia sẻ dữ liệu, rồi hỏi lại nhé.`,
  };
}
