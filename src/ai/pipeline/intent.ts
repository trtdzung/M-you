/**
 * Cheap keyword intent classification. Kept deliberately simple (YAGNI): one
 * heuristic pass, no second LLM round-trip. The result drives scope/required-data
 * checks and gives the model tool hints. Ambiguity is fine — the LLM still picks
 * tools; this only gates access and enables the offline fallback.
 */

import type { ConsentScope } from "@/lib/consent";

export type IntentKind =
  | "explain_month"
  | "top_category"
  | "upcoming"
  | "networth"
  | "whatif_goal"
  | "whatif_debt"
  | "action_transfer"
  | "unknown";

export interface Intent {
  kind: IntentKind;
  needsScopes: ConsentScope[];
  toolHints: string[];
}

interface Rule {
  kind: IntentKind;
  needsScopes: ConsentScope[];
  toolHints: string[];
  patterns: RegExp[];
}

// Order matters: action + what-if are checked before generic explain.
const RULES: Rule[] = [
  {
    kind: "action_transfer",
    needsScopes: ["transactions"],
    toolHints: [],
    patterns: [
      /chuyển\s*(tiền|khoản)/i,
      /chuyển\s+\d/i,
      /chuyển\b[^.?!]*\bcho\b/i,
      /gửi\s*tiền\s*cho/i,
      /thanh\s*toán\s*cho\b/i,
      /\btransfer\b/i,
    ],
  },
  {
    kind: "whatif_debt",
    needsScopes: ["liabilities"],
    toolHints: ["simulateDebtRepayment"],
    patterns: [/trả\s*(nợ|góp)/i, /tất\s*toán/i, /hết\s*nợ/i, /bao\s*giờ.*(nợ|trả)/i],
  },
  {
    kind: "whatif_goal",
    needsScopes: ["transactions"],
    toolHints: ["simulateGoal"],
    patterns: [/mục\s*tiêu/i, /tiết\s*kiệm/i, /bao\s*giờ.*đạt/i, /\bgoal\b/i, /đủ\s*tiền/i],
  },
  {
    kind: "networth",
    needsScopes: ["assets", "liabilities"],
    toolHints: ["calculateNetWorth"],
    patterns: [/giá\s*trị\s*ròng/i, /tài\s*sản/i, /net\s*worth/i, /tổng\s*nợ/i],
  },
  {
    kind: "upcoming",
    needsScopes: ["transactions", "liabilities"],
    toolHints: ["getUpcomingObligations"],
    patterns: [/đến\s*hạn/i, /sắp\s*(phải\s*)?(trả|tới)/i, /hoá\s*đơn/i],
  },
  {
    kind: "top_category",
    needsScopes: ["transactions"],
    toolHints: ["getSpendingByCategory"],
    patterns: [/tiêu\s*nhiều/i, /danh\s*mục/i, /chi\s*nhiều\s*nhất/i, /nhiều\s*nhất\s*(vào|cho)/i],
  },
  {
    kind: "explain_month",
    needsScopes: ["transactions"],
    toolHints: ["getMonthlyCashflow"],
    patterns: [/tháng\s*này/i, /giải\s*thích/i, /dòng\s*tiền/i, /thu\s*(nhập|chi)/i, /chi\s*tiêu/i],
  },
];

export function classifyIntent(text: string): Intent {
  const t = text ?? "";
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(t))) {
      return { kind: rule.kind, needsScopes: rule.needsScopes, toolHints: rule.toolHints };
    }
  }
  return { kind: "unknown", needsScopes: ["transactions"], toolHints: [] };
}
