"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/primitives";
import { AiSessionNote } from "@/components/security/InterventionCopy";
import { ruleHandbook, type HandbookArticle, type HandbookContext } from "@/lib/security/handbook";
import { usePersona } from "@/providers/context";
import { useSecurityStore } from "@/state/security/store";

function sameArticle(value: unknown, rule: HandbookArticle): value is { summary: [string, string, string] } {
  if (!value || typeof value !== "object") return false;
  const row = value as { articleId?: unknown; summary?: unknown; source?: unknown };
  return row.source === "agent" && row.articleId === rule.id && Array.isArray(row.summary) && row.summary.length === 3
    && row.summary.every(line => typeof line === "string" && line.trim().length > 0);
}

/** Three-line handbook. The rule shows at once; a personal summary may replace it. */
export function HandbookSheet({ context, onClose }: { context: HandbookContext; onClose: () => void }) {
  const { persona } = usePersona();
  const aiProtect = useSecurityStore(state => state.aiProtect);
  const rule = ruleHandbook(context);
  const [summary, setSummary] = useState(rule.summary);
  const [source, setSource] = useState<"rule" | "agent">("rule");

  useEffect(() => {
    setSummary(rule.summary);
    setSource("rule");
    if (!aiProtect) return;
    let cancel = false;
    void fetch("/api/security/educate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cif: persona.cif, trigger: context }),
    }).then(async response => {
      if (!response.ok || cancel) return;
      const body: unknown = await response.json();
      if (cancel || !sameArticle(body, rule)) return;
      setSummary(body.summary);
      setSource("agent");
    }).catch(() => {});
    return () => { cancel = true; };
  }, [aiProtect, context, persona.cif, rule]);

  return (
    <Sheet open title={rule.title} onClose={onClose}>
      {source === "agent" && <AiSessionNote />}
      <p className="text-xs font-semibold text-muted">{source === "agent" ? "M-You, trợ lý AI của MSB" : "Cảnh báo tự động"}</p>
      <ol className="my-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
        {summary.map(line => <li key={line}>{line}</li>)}
      </ol>
      <Link href={`/settings/knowledge?article=${rule.id}`} className="text-sm font-semibold text-primary">Link bài đầy đủ</Link>
    </Sheet>
  );
}
