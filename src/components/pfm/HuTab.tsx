"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { Card, Money, SectionHeader, Sheet, SourceBadge } from "@/components/primitives";
import { ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { JarList } from "@/components/jars/JarList";
import { JarSetup } from "@/components/jars/JarSetup";
import { useFinancials } from "@/state/useFinancials";
import { monthKeyLabel } from "@/lib/demo-clock";

/**
 * Hũ tab — the shipped balance-lens partition (Model A), promoted from a dock
 * inside the Dòng tiền sub-hub to a top-level PFM tab (between Tổng quan and
 * Dòng tiền). `JarList` keeps the reconciliation meter + over-allocated warning;
 * "Điều chỉnh hũ" opens `JarSetup` in a modal. A `PeriodPicker` drives the
 * per-period "đã tiêu kỳ này" overlay (previously supplied by the sub-hub). The
 * identity `Σ hũ ≡ số dư` is owned by the engine — this tab changes mount points
 * only, never `jars.ts` internals (invariant #1).
 */
export function HuTab() {
  const { loading, error, financials } = useFinancials();
  const params = useSearchParams();
  const router = useRouter();
  const setupParam = params?.get("setup");
  const [setupOpen, setSetupOpen] = useState(setupParam === "1");

  useEffect(() => {
    if (setupParam === "1") setSetupOpen(true);
  }, [setupParam]);

  function closeSetup() {
    setSetupOpen(false);
    router.replace("/pfm?tab=hu", { scroll: false });
  }

  if (error) return <ErrorState />;

  if (loading || !financials) {
    return (
      <SkeletonScreen>
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-40" />
      </SkeletonScreen>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PeriodPicker />

      <Card className="flex flex-col gap-3" role="region">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Số dư đang phân chia</p>
            <Money amount={financials.jarPartition.primaryBalance} className="mt-1 block text-2xl font-bold text-text" />
          </div>
          <SourceBadge source={financials.jarPartition.meta.source} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
          <span className="text-muted">Chưa phân bổ</span>
          <Money
            amount={financials.jarPartition.lines.find((line) => line.isResidual)?.earmark ?? "unknown"}
            className="font-semibold text-text"
          />
        </div>
        <p className="text-xs leading-5 text-muted">
          Hũ là cách nhìn số dư hiện tại theo nhóm chi tiêu. Tiền vẫn nằm nguyên trong tài khoản của bạn.
        </p>
      </Card>

      <SectionHeader
        title="Hũ chi tiêu"
        subtitle="Chia số dư hiện tại theo hạng mục"
        action={
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <SlidersHorizontal size={14} aria-hidden="true" /> Điều chỉnh hũ
          </button>
        }
      />

      <JarList partition={financials.jarPartition} periodLabel={monthKeyLabel(financials.monthKey)} />

      {setupOpen && <HuSetupModal onClose={closeSetup} />}
    </div>
  );
}

function HuSetupModal({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      title="Điều chỉnh hũ"
      description="Thiết lập hũ và phân bổ theo hạng mục"
      onClose={onClose}
      closeLabel="Xong"
      className="pb-[calc(32px+var(--safe-area-bottom))]"
    >
        <JarSetup />
    </Sheet>
  );
}
