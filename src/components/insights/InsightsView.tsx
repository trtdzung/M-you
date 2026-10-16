"use client";

import { useMemo, useState } from "react";
import { Card, SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { InsightCard } from "@/components/insights/InsightCard";
import { InsightFilters, type InsightFilter } from "@/components/insights/InsightFilters";
import { useInsights } from "@/state/useInsights";
import { SEVERITY_RANK, type Insight, type InsightSeverity } from "@/insights/types";

/**
 * Gợi ý tab: severity-organized insight list mounted by `PfmTabHost` (Red Team
 * C4 — the route page is a redirect stub; content lives here). Filter chips +
 * grouping are presentation over `useInsights().visible` — no new insight logic.
 */

const SEVERITY_GROUPS: { severity: InsightSeverity; label: string }[] = [
  { severity: "urgent", label: "Cần chú ý" },
  { severity: "attention", label: "Lưu ý" },
  { severity: "info", label: "Thông tin" },
];

export function InsightsView() {
  const { loading, error, visible, dismiss, snooze, markHelpful } = useInsights();
  const [filter, setFilter] = useState<InsightFilter>("all");

  const counts = useMemo(() => {
    const c: Record<InsightFilter, number> = { all: visible.length, urgent: 0, attention: 0, info: 0 };
    for (const i of visible) c[i.severity] += 1;
    return c;
  }, [visible]);

  const actions = { dismiss, snooze, markHelpful };

  return (
    <div>
      <div className="mb-4">
        <PeriodPicker />
      </div>

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && (
        <div className="flex flex-col gap-4">
          <InsightFilters active={filter} counts={counts} onChange={setFilter} />

          {visible.length === 0 ? (
            <Empty title="Chưa có gợi ý" description="Chưa phát hiện điểm nào đáng chú ý trong tháng này." />
          ) : filter === "all" ? (
            <GroupedList insights={visible} actions={actions} />
          ) : (
            <FilteredList insights={visible.filter((i) => i.severity === filter)} actions={actions} />
          )}
        </div>
      )}
    </div>
  );
}

function GroupedList({ insights, actions }: { insights: Insight[]; actions: FilterActions }) {
  const sorted = [...insights].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return (
    <div className="flex flex-col gap-5">
      {SEVERITY_GROUPS.map(({ severity, label }) => {
        const rows = sorted.filter((i) => i.severity === severity);
        if (rows.length === 0) return null;
        return (
          <section key={severity}>
            <SectionHeader title={label} subtitle={`${rows.length} mục`} />
            <div className="flex flex-col gap-3">
              {rows.map((i) => (
                <InsightCard key={i.id} insight={i} actions={actions} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FilteredList({ insights, actions }: { insights: Insight[]; actions: FilterActions }) {
  if (insights.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">Không có mục ở mức này.</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} actions={actions} />
      ))}
    </div>
  );
}

type FilterActions = { dismiss: (id: string) => void; snooze: (id: string) => void; markHelpful: (id: string) => void };
