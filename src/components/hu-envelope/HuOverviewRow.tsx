"use client";

import { useState } from "react";
import type { Financials } from "@/domain/engine/finance-compose";
import { useJarConfig } from "@/state/jars";
import { jarAccent } from "@/lib/category-colors";
import { jarIcon } from "@/components/settings/jar-visuals";
import type { PfmTabId } from "@/components/pfm/PfmTabs";
import { PendingAllocationCard } from "./PendingAllocationCard";
import { JarEnvelopeCard } from "./JarEnvelopeCard";
import { AllocationSheet } from "./AllocationSheet";

/**
 * Tổng quan "hũ (phong bì)" row: a horizontally-scrolling strip of a "Chờ phân
 * bổ" card + one envelope card per jar ("còn lại trong hũ" = engine-derived
 * funded − spent, "ĐANG DÙNG" when funded this period). Pure presentation of
 * `financials.jarEnvelope` (invariant #1); jar colours/icons come from the jar
 * config (presentation state). "Chia ngay →" opens the allocation sheet.
 *
 * Tapping a jar card jumps to the real jar view (the Ngân sách tab) via
 * `onNavigate` — the overview cards are a summary, the management lives there.
 */
export function HuOverviewRow({
  financials,
  onNavigate,
}: {
  financials: Financials;
  /** Jump to another PFM tab (a tapped jar card opens Ngân sách). */
  onNavigate?: (tab: PfmTabId) => void;
}) {
  const { config } = useJarConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { pending, jars } = financials.jarEnvelope;

  // No jars configured → nothing to show (the row simply doesn't render).
  if (jars.length === 0) return null;

  // A jar's colour/icon lives in the config, not the engine line — look it up.
  const accentOf = (jarId: string) => {
    const jar = config.jars.find((j) => j.id === jarId);
    return jar ? jarAccent(jar) : jarAccent({ categoryIds: [] });
  };
  const iconOf = (jarId: string) => jarIcon(config.jars.find((j) => j.id === jarId)?.icon);

  const showPending = pending.amount === "unknown" || pending.unallocatedCount > 0;

  return (
    <section aria-label="Hũ chi tiêu" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-text">Hũ chi tiêu</h2>
      </div>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {showPending && (
          <PendingAllocationCard
            amount={pending.amount}
            count={pending.unallocatedCount}
            onAllocate={() => setSheetOpen(true)}
          />
        )}
        {jars.map((line) => (
          <JarEnvelopeCard
            key={line.jarId}
            label={line.label}
            accent={accentOf(line.jarId)}
            remaining={line.remaining}
            inUse={line.inUse}
            Icon={iconOf(line.jarId)}
            onOpen={onNavigate ? () => onNavigate("budget") : undefined}
          />
        ))}
      </div>

      {sheetOpen && (
        <AllocationSheet envelope={financials.jarEnvelope} jars={config.jars} onClose={() => setSheetOpen(false)} />
      )}
    </section>
  );
}
