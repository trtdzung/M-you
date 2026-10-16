"use client";

import { useState } from "react";
import type { Financials } from "@/domain/engine/finance-compose";
import type { Transaction } from "@/domain/models";
import { useJarConfig } from "@/state/jars";
import { jarAccent } from "@/lib/category-colors";
import { jarIcon } from "@/components/settings/jar-visuals";
import type { PfmTabId } from "@/components/pfm/PfmTabs";
import { PendingAllocationCard } from "./PendingAllocationCard";
import { UnlabeledSpendCard } from "./UnlabeledSpendCard";
import { UnlabeledSpendSheet } from "./UnlabeledSpendSheet";
import { JarEnvelopeCard } from "./JarEnvelopeCard";
import { AllocationSheet } from "./AllocationSheet";

/**
 * Tổng quan "hũ (phong bì)" row: a horizontally-scrolling strip of a "Chờ phân
 * bổ" card + one envelope card per jar ("còn lại trong hũ" = engine-derived
 * earmark − spent, where earmark = phân bổ CASA hoặc hạn mức). Pure presentation
 * of `financials.jarEnvelope` (invariant #1); jar colours/icons come from the jar
 * config (presentation state). "Chia ngay →" opens the allocation sheet.
 *
 * Tapping a jar card jumps to the real jar view (the Ngân sách tab) via
 * `onNavigate` — the overview cards are a summary, the management lives there.
 */
export function HuOverviewRow({
  financials,
  unlabeledItems = [],
  onNavigate,
}: {
  financials: Financials;
  /**
   * Current-month unlabeled expenses (`selectUnlabeledSpend(...).items`) for the
   * labeling sheet — the SAME selector feeding `financials.unlabeled.count`
   * (parity, RT#1). Defaults to `[]` so partial-`Financials` test fixtures that
   * omit it stay valid.
   */
  unlabeledItems?: Transaction[];
  /** Jump to another PFM tab (a tapped jar card opens Ngân sách). */
  onNavigate?: (tab: PfmTabId) => void;
}) {
  const { config } = useJarConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labelSheetOpen, setLabelSheetOpen] = useState(false);
  const { pending, jars } = financials.jarEnvelope;
  const overAllocated = financials.unallocatedPool.overAllocated;

  // The "Chưa gắn nhãn" (hũ "chờ chia") card is a data-quality prompt, not a jar.
  // It ALWAYS shows whenever the engine computed `unlabeled` — even when NO jars
  // exist (RT#11) and even at count 0 (it renders its own "đã gắn nhãn hết" empty
  // state). Optional-chained so partial-`Financials` fixtures (no `unlabeled`)
  // simply skip it.
  const unlabeledCount = financials.unlabeled?.count ?? 0;
  const showUnlabeled = financials.unlabeled != null;

  // Nothing to surface at all → the row doesn't render.
  if (jars.length === 0 && !showUnlabeled) return null;

  // A jar's colour/icon lives in the config, not the engine line — look it up.
  const accentOf = (jarId: string) => {
    const jar = config.jars.find((j) => j.id === jarId);
    return jar ? jarAccent(jar) : jarAccent({ categoryIds: [] });
  };
  const iconOf = (jarId: string) => jarIcon(config.jars.find((j) => j.id === jarId)?.icon);

  // Pending + jar cards only make sense once jars exist (the unlabeled card can
  // stand alone — RT#11); with no jars the pending pool has no allocation target.
  const hasJars = jars.length > 0;
  const showPending = hasJars && (pending.amount === "unknown" || pending.amount > 0);

  return (
    <section aria-label="Hũ chi tiêu" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-text">Hũ chi tiêu</h2>
        {overAllocated && (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
            Vượt phân bổ
          </span>
        )}
      </div>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {showUnlabeled && (
          <UnlabeledSpendCard
            count={unlabeledCount}
            amount={financials.unlabeled?.amount ?? 0}
            onOpen={() => setLabelSheetOpen(true)}
          />
        )}
        {showPending && (
          <PendingAllocationCard amount={pending.amount} onAllocate={() => setSheetOpen(true)} />
        )}
        {jars.map((line) => (
          <JarEnvelopeCard
            key={line.jarId}
            label={line.label}
            accent={accentOf(line.jarId)}
            remaining={line.remaining}
            Icon={iconOf(line.jarId)}
            onOpen={onNavigate ? () => onNavigate("budget") : undefined}
          />
        ))}
      </div>

      {sheetOpen && (
        <AllocationSheet envelope={financials.jarEnvelope} jars={config.jars} onClose={() => setSheetOpen(false)} />
      )}

      {labelSheetOpen && (
        <UnlabeledSpendSheet items={unlabeledItems} onClose={() => setLabelSheetOpen(false)} />
      )}
    </section>
  );
}
