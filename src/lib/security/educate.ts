import "server-only";

import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { ruleHandbook, type HandbookArticle, type HandbookContext } from "./handbook";
import { readProfile } from "./profile-store";

export type HandbookView = HandbookArticle & { source: "rule" | "agent" };

const CONTEXTS = new Set<HandbookContext>([
  "new_customer", "device_login", "warned_account", "warned_scan",
  "hub_first", "balance_up", "after_incident",
]);

function lines(value: unknown): value is [string, string, string] {
  return Array.isArray(value) && value.length === 3
    && value.every(line => typeof line === "string" && line.trim().length > 0 && line.length <= 180);
}

function asAgent(value: unknown, rule: HandbookArticle): HandbookView | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.article_id !== rule.id || !lines(row.summary)) return null;
  const text = row.summary.join(" ");
  if (/an toàn|không phải lừa đảo|https?:|www\./i.test(text)) return null;
  return { ...rule, summary: row.summary, source: "agent" };
}

/** Rule article at once. A valid agent summary may replace the three lines, never the article. */
export async function educateHandbook(cif: string, context: HandbookContext): Promise<HandbookView> {
  const rule: HandbookView = { ...ruleHandbook(context), source: "rule" };
  if (!readProfile(cif).aiProtect) return rule;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      forwardToAgent("/fraud/educate", { trigger: context, cif }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 7_000); }),
    ]);
    if (!response.ok) return rule;
    return asAgent(await response.json(), rule) ?? rule;
  } catch {
    return rule;
  } finally { if (timer) clearTimeout(timer); }
}

export function isHandbookContext(value: unknown): value is HandbookContext {
  return typeof value === "string" && CONTEXTS.has(value as HandbookContext);
}
