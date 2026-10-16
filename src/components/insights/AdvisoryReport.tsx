"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { Card, ProvenanceChip } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { InsightEvidence } from "./InsightEvidence";
import { BriefSection } from "./BriefSection";
import { useFinancials } from "@/state/useFinancials";
import { composeMonthlyBrief, type BriefAction, type BriefHighlight } from "@/insights/brief";
import { resolveIntentRoute } from "@/lib/copilot-nav";
import { monthKeyLabel } from "@/lib/demo-clock";

/**
 * Báo cáo tư vấn — the deterministic monthly advisory report. Renders the brief
 * composed in `src/insights/brief.ts`: positives, risks, behavioral highlights
 * (with evidence + provenance) and templated "nghĩa là gì / nên làm gì" CTAs.
 *
 * NO LLM, NO network here (red-team #5). Every displayed number traces to an
 * engine fact with provenance (#1/#5). CTAs are tappable deep-links resolved via
 * `resolveIntentRoute` — they never auto-navigate and never move money (#3).
 */
export function AdvisoryReport() {
  const { financials, loading, error } = useFinancials();
  const brief = useMemo(
    () => (financials ? composeMonthlyBrief(financials) : null),
    [financials],
  );

  if (loading) {
    return (
      <SkeletonScreen>
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-28" />
      </SkeletonScreen>
    );
  }
  if (error || !brief) return <ErrorState />;

  if (!brief.sufficientData) {
    return (
      <Empty
        icon={<FileText size={40} strokeWidth={1.5} />}
        title="Chưa đủ dữ liệu cho báo cáo"
        description={brief.emptyMessage ?? undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-base font-semibold text-text">
          Báo cáo tư vấn · {monthKeyLabel(brief.monthKey)}
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Tóm tắt hành vi chi tiêu và gợi ý cho tháng này.
        </p>
      </header>

      {brief.actions.length > 0 && (
        <BriefSection title="Nên làm gì" icon={<Sparkles size={16} className="text-primary" />}>
          {brief.actions.map((a, i) => (
            <ActionCta key={i} action={a} />
          ))}
        </BriefSection>
      )}

      {brief.positives.length > 0 && (
        <BriefSection
          title="Điểm tích cực"
          count={brief.positives.length}
          icon={<CheckCircle2 size={16} className="text-positive" />}
        >
          {brief.positives.map((p, i) => (
            <FindingRow key={i} title={p.title} detail={p.detail} source={p.source} freshness={p.freshness} />
          ))}
        </BriefSection>
      )}

      {brief.risks.length > 0 && (
        <BriefSection
          title="Cần lưu ý"
          count={brief.risks.length}
          icon={<AlertTriangle size={16} className="text-warning" />}
        >
          {brief.risks.map((r, i) => (
            <FindingRow key={i} title={r.title} detail={r.detail} source={r.source} freshness={r.freshness} />
          ))}
        </BriefSection>
      )}

      {brief.highlights.length > 0 && (
        <BriefSection
          title="Chi tiết & gợi ý"
          count={brief.highlights.length}
          icon={<Lightbulb size={16} className="text-primary" />}
        >
          {brief.highlights.map((h) => (
            <HighlightCard key={h.insight.id} highlight={h} />
          ))}
        </BriefSection>
      )}
    </div>
  );
}

function FindingRow({
  title,
  detail,
  source,
  freshness,
}: {
  title: string;
  detail: string;
  source: "msb" | "self_reported" | "estimated" | "mock";
  freshness: string | null;
}) {
  return (
    <Card className="p-3">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-0.5 text-sm text-muted">{detail}</p>
      <ProvenanceChip className="mt-2" source={source} freshness={freshness} />
    </Card>
  );
}

function HighlightCard({ highlight }: { highlight: BriefHighlight }) {
  const { insight, meaning, action, source, freshness } = highlight;
  return (
    <Card className="p-3">
      <p className="text-sm font-semibold text-text">{insight.title}</p>
      <p className="mt-0.5 text-sm text-muted">{insight.explanation}</p>

      <InsightEvidence insight={insight} />
      <ProvenanceChip className="mt-2" source={source} freshness={freshness} />

      <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3">
        <p className="text-xs font-medium text-muted">Nghĩa là gì</p>
        <p className="mt-0.5 text-sm text-text">{meaning}</p>
      </div>

      <ActionCta className="mt-2" action={action} />
    </Card>
  );
}

function ActionCta({ action, className }: { action: BriefAction; className?: string }) {
  const href = resolveIntentRoute(action.intentId);
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-between gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${className ?? ""}`}
    >
      <span>{action.label}</span>
      <ArrowUpRight size={16} className="shrink-0" />
    </Link>
  );
}
