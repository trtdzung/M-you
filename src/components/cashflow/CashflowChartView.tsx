"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { FileText } from "lucide-react";
import { Card, Freshness, Money, SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { CashflowTrendChart } from "@/components/charts/CashflowTrendChart";
import { ReportBriefSheet } from "./ReportBriefSheet";
import { useFinancials } from "@/state/useFinancials";
import { useJarConfig } from "@/state/jars";
import {
  cashflowTrend,
  groupSpendingByJar,
  jarChipList,
  monthPeriodFromKey,
  spendingByCategory,
  type CategorySpend,
} from "@/domain/engine";
import { monthKeyLabel, prevMonthKey } from "@/lib/demo-clock";
import { categoryColor } from "@/lib/category-colors";
import { formatVndCompact } from "@/lib/format";
import { REPORT_ANCHOR } from "@/lib/copilot-nav";
import { cn } from "@/lib/cn";

/** Chip id for the unfiltered "Tất cả" view (not a real jar). */
const ALL = "all";

/**
 * Dòng tiền — a pure chart view of the period's spending by category, filtered by
 * jar. Replaces the retired 3-dock sub-hub (RT #7). The transaction feed lives at
 * `/transactions`; tapping a category drills there (RT #3). Data comes straight
 * from the engine (`spendingByCategory` + `groupSpendingByJar`) — every number
 * traces to a fact, none is invented (invariants #1/#4). The donut and bar share
 * one stable color map by categoryId (RT #8); the MoM delta is "—" when the prior
 * period has no data (RT #10); chips come from the full config so a zero-spend jar
 * still appears (RT #11). The 6-month trend is relocated here from the old Giao
 * dịch dock (RT #2).
 */
export function CashflowChartView() {
  const { loading, error, financials, transactions } = useFinancials();
  const { config } = useJarConfig();
  const router = useRouter();
  const [selectedJar, setSelectedJar] = useState<string>(ALL);
  const [reportOpen, setReportOpen] = useState(false);

  const monthKey = financials?.monthKey ?? null;

  const derived = useMemo(() => {
    if (!monthKey) return null;
    const period = monthPeriodFromKey(monthKey);
    const prevPeriod = monthPeriodFromKey(prevMonthKey(monthKey));
    const allSpend = spendingByCategory(transactions, period);
    const groups = groupSpendingByJar(config, transactions, period);
    const prev = spendingByCategory(transactions, prevPeriod);
    return {
      allSpend,
      groups,
      prevMap: new Map(prev.map((c) => [c.categoryId, c.amount])),
      prevHasData: prev.length > 0,
      trend: cashflowTrend(transactions, monthKey),
    };
  }, [monthKey, transactions, config]);

  if (error) return <ErrorState />;
  if (loading || !financials || !derived) {
    return (
      <SkeletonScreen>
        <SkeletonCard className="h-10" />
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-40" />
      </SkeletonScreen>
    );
  }

  const chips = [{ jarId: ALL, label: "Tất cả" }, ...jarChipList(config)];
  const visible: CategorySpend[] =
    selectedJar === ALL
      ? derived.allSpend
      : derived.groups.find((g) => g.jarId === selectedJar)?.categories ?? [];
  const visibleTotal = visible.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="flex flex-col gap-5">
      <PeriodPicker />

      <CashflowSummary financials={financials} />

      <div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo hũ">
        {chips.map((chip) => {
          const selected = chip.jarId === selectedJar;
          return (
            <button
              key={chip.jarId}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedJar(chip.jarId)}
              className={cn(
                "inline-flex min-h-[44px] items-center justify-center rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                selected
                  ? "border-primary bg-primary-soft text-primary-strong"
                  : "border-border bg-surface text-muted hover:text-text",
              )}
            >
              {chip.label}
            </button>
          );
        })}
        </div>
      </div>

      <section>
        <SectionHeader title="Chi tiêu theo danh mục" />
        <Card>
          {visible.length > 0 ? (
            <>
              <div className="relative">
                <ChartFrame height={220} label="Tỉ trọng chi tiêu theo danh mục">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={visible}
                        dataKey="amount"
                        nameKey="label"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={1}
                        stroke="var(--color-surface)"
                      >
                        {visible.map((c) => (
                          <Cell key={c.categoryId} fill={categoryColor(c.categoryId)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number, name) => [formatVndCompact(v), name as string]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartFrame>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[11px] text-muted">Tổng chi</span>
                  <Money amount={visibleTotal} className="text-sm font-semibold text-text" />
                </div>
              </div>

              <ul className="mt-4 flex flex-col gap-3">
                {visible.map((c) => {
                  const share = visibleTotal > 0 ? c.amount / visibleTotal : 0;
                  const prevAmount = derived.prevMap.get(c.categoryId) ?? 0;
                  return (
                    <li key={c.categoryId}>
                      <button
                        type="button"
                        onClick={() => {
                          const query = new URLSearchParams({
                            category: c.categoryId,
                            month: financials.monthKey,
                            origin: "cashflow",
                          });
                          if (selectedJar !== ALL) query.set("jar", selectedJar);
                          router.push(`/transactions?${query.toString()}`);
                        }}
                        className="flex min-h-[44px] w-full flex-col justify-center rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        aria-label={`Xem giao dịch nhóm ${c.label}`}
                      >
                        <div className="mb-1 flex items-baseline justify-between text-sm">
                          <span className="flex items-center gap-2 text-text">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: categoryColor(c.categoryId) }}
                            />
                            {c.label}
                          </span>
                          <span className="flex items-baseline gap-2">
                            <span className="text-xs text-muted">{Math.round(share * 100)}%</span>
                            <Money amount={c.amount} className="font-medium text-text" />
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${share * 100}%`, background: categoryColor(c.categoryId) }}
                          />
                        </div>
                        <div className="mt-1">
                          {derived.prevHasData ? (
                            <DeltaBadge current={c.amount} previous={prevAmount} goodWhenDown />
                          ) : (
                            <span className="text-xs text-muted">— so với tháng trước</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <Empty title="Chưa có chi tiêu kỳ này" description="Chọn hũ khác hoặc tháng khác để xem." />
          )}
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Xu hướng thu/chi"
          subtitle="6 tháng gần nhất"
          action={<Freshness at={derived.trend.meta.freshness} className="text-[11px]" />}
        />
        <Card>
          <CashflowTrendChart points={derived.trend.points} />
          <div className="mt-2">
            <DeltaBadge current={financials.cashflow.net} previous={financials.prevCashflow.net} />
          </div>
        </Card>
      </section>

      <section id={REPORT_ANCHOR} className="scroll-mt-4">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <FileText size={18} className="shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="block text-sm font-semibold text-text">Xem báo cáo tháng</span>
            <span className="block text-xs text-muted">Tóm tắt hành vi chi tiêu và gợi ý</span>
          </span>
        </button>
      </section>

      {reportOpen && <ReportBriefSheet onClose={() => setReportOpen(false)} />}
    </div>
  );
}

function CashflowSummary({
  financials,
}: {
  financials: NonNullable<ReturnType<typeof useFinancials>["financials"]>;
}) {
  const { cashflow } = financials;
  return (
    <section aria-label="Tóm tắt dòng tiền">
      <SectionHeader title={monthKeyLabel(financials.monthKey)} />
      <Card className="grid grid-cols-3 gap-2" role="region">
        <SummaryCell label="Thu vào" amount={cashflow.income} tone="text-positive" />
        <SummaryCell label="Chi ra" amount={cashflow.expense} tone="text-text" />
        <SummaryCell
          label="Chênh lệch"
          amount={cashflow.net}
          tone={cashflow.net >= 0 ? "text-positive" : "text-negative"}
        />
      </Card>
      {cashflow.pendingExpense > 0 && (
        <p className="mt-2 rounded-xl bg-warning-soft/70 px-3 py-2 text-xs text-text">
          Đang chờ ghi nhận: <Money amount={cashflow.pendingExpense} className="font-semibold" />, chưa tính vào tổng.
        </p>
      )}
    </section>
  );
}

function SummaryCell({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{label}</p>
      <Money amount={amount} className={`mt-1 block truncate text-sm font-bold ${tone}`} />
    </div>
  );
}
