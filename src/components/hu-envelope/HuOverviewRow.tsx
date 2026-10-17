"use client";

import { useEffect, useState } from "react";
import type { Financials, RawData } from "@/domain/engine/finance-compose";
import type { Transaction } from "@/domain/models";
import { useJarConfig } from "@/state/jars";
import { ErrorState } from "@/components/states";
import { jarAccent } from "@/lib/category-colors";
import { jarIcon } from "@/components/settings/jar-visuals";
import { currentMonthKey } from "@/lib/demo-clock";
import { PendingAllocationCard } from "./PendingAllocationCard";
import { UnlabeledSpendCard } from "./UnlabeledSpendCard";
import { UnlabeledSpendSheet } from "./UnlabeledSpendSheet";
import { JarEnvelopeCard } from "./JarEnvelopeCard";
import { AllocationSheet } from "./AllocationSheet";
import { JarTransferSheet, type JarTransferSummary } from "./JarTransferSheet";
import { formatVnd } from "@/lib/format";

/**
 * Tổng quan "hũ (phong bì)" row: a horizontally-scrolling strip of a "Chờ phân
 * bổ" card + one envelope card per jar (SỐ DƯ + "Đã chi / hạn mức", plan 260923).
 * Pure presentation of `financials.jarEnvelope` (invariant #1); jar colours/icons
 * come from the jar config (presentation state). "Chia ngay →" opens the
 * allocation sheet. The pool is a CURRENT stock, so "Chờ phân bổ" and the sheet
 * render only when `financials.monthKey` is the current month (Red Team #2).
 *
 * Tapping a jar card (current month only) opens `JarTransferSheet` with that jar
 * as the source — moving SỐ DƯ between jars / the pool, never a limit. A past
 * month's cards are view-only. A finished transfer shows a `role="status"`
 * banner for 4s.
 */
export function HuOverviewRow({
  financials,
  unlabeledItems = [],
  transactions = [],
  raw = null,
}: {
  financials: Financials;
  /**
   * Current-month unlabeled expenses (`selectUnlabeledSpend(...).items`) for the
   * labeling sheet — the SAME selector feeding `financials.unlabeled.count`
   * (parity, RT#1). Defaults to `[]` so partial-`Financials` test fixtures that
   * omit it stay valid.
   */
  unlabeledItems?: Transaction[];
  /** The merged txn view + raw data the overview already loaded — fed to the transfer sheet (no second fetch). */
  transactions?: Transaction[];
  raw?: RawData | null;
}) {
  const { config, error: jarError } = useJarConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labelSheetOpen, setLabelSheetOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState<string | null>(null);
  const [transferDone, setTransferDone] = useState<JarTransferSummary | null>(null);

  useEffect(() => {
    if (!transferDone) return;
    const timer = window.setTimeout(() => setTransferDone(null), 4000);
    return () => window.clearTimeout(timer);
  }, [transferDone]);
  const { pending, jars } = financials.jarEnvelope;
  const overAllocated = financials.unallocatedPool.overAllocated;

  // U10: a failed jar load must not masquerade as "no jars" (nor show all of CASA
  // as "Chờ phân bổ") — render an explicit error for the section instead.
  if (jarError) {
    return (
      <section aria-label="Hũ chi tiêu" className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-text">Hũ chi tiêu</h2>
        <ErrorState title="Không tải được hũ chi tiêu" description="Số dư các hũ tạm thời không hiển thị. Vui lòng thử lại sau." />
      </section>
    );
  }

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
  // `pending.amount` is "Chờ phân bổ" (CASA − Σ spendable), identical to the sheet's
  // opening "Còn lại để chia" and the picker's "Chưa phân bổ" (D26); ≤ 0 → hidden.
  const hasJars = jars.length > 0;
  const isCurrentMonth = financials.monthKey === currentMonthKey();
  const showPending = isCurrentMonth && hasJars && (pending.amount === "unknown" || pending.amount > 0);

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
            balance={line.balance}
            spent={line.spent}
            limit={line.limit}
            Icon={iconOf(line.jarId)}
            onOpen={isCurrentMonth ? () => setTransferFromId(line.jarId) : undefined}
          />
        ))}
      </div>

      {transferDone && (
        <p role="status" className="rounded-xl bg-positive-soft px-3 py-2 text-sm text-positive">
          Đã chuyển {formatVnd(transferDone.amount)} từ {transferDone.fromLabel} sang {transferDone.toLabel}
        </p>
      )}

      {transferFromId && isCurrentMonth && (
        <JarTransferSheet
          initialFromId={transferFromId}
          transactions={transactions}
          raw={raw}
          onClose={() => setTransferFromId(null)}
          onDone={(summary) => {
            setTransferFromId(null);
            setTransferDone(summary);
          }}
        />
      )}

      {sheetOpen && isCurrentMonth && (
        <AllocationSheet envelope={financials.jarEnvelope} jars={config.jars} onClose={() => setSheetOpen(false)} />
      )}

      {labelSheetOpen && (
        <UnlabeledSpendSheet items={unlabeledItems} onClose={() => setLabelSheetOpen(false)} />
      )}
    </section>
  );
}
