"use client";

import { useMemo, useRef, useState } from "react";
import { RotateCcw, Repeat } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { jarSpendable, type DonorProposal } from "@/domain/engine";
import { useFinancials } from "@/state/useFinancials";
import { useAutoFund } from "@/state/use-auto-fund";

/**
 * Post-fund toast (plan 260918-1120, Phase 04): "Đã bù X từ <donor> → <target>"
 * with [Hoàn tác] (C4 — remove + re-validate both sides) and [Đổi nguồn] (H1 —
 * atomic donor swap). Scoped to the success screen: if the user leaves, the fund
 * stands (documented, acceptable for the prototype); the C4/H1 logic still runs
 * on tap. Every number comes from the engine via `useAutoFund` (invariant #1).
 */
export function AutoFundResultBanner({
  triggerTxnId,
  targetJarId,
  targetLabel,
  postedAt,
  donors,
  createdIds,
}: {
  triggerTxnId: string;
  targetJarId: string | null;
  targetLabel: string;
  postedAt: string;
  donors: DonorProposal[];
  createdIds: string[];
}) {
  const autoFund = useAutoFund();
  const { financials } = useFinancials();
  const [ids, setIds] = useState(createdIds);
  const [note, setNote] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const undoing = useRef(false);

  const total = donors.reduce((s, d) => s + d.take, 0);
  const donorText = donors.map((d) => d.label).join(", ") || "nguồn khác";

  // Eligible alternative donors (H1): jars that can fully cover the shortfall on
  // their own, excluding the target and the donors already used.
  const usedIds = useMemo(() => new Set(donors.map((d) => d.jarId)), [donors]);
  const alternatives = useMemo(() => {
    const shortfall = total;
    return (financials?.jarBudget.lines ?? [])
      .filter((l) => l.huId !== targetJarId && !usedIds.has(l.huId))
      .map((l) => ({ huId: l.huId, label: l.label, spendable: jarSpendable(l.remaining) ?? 0 }))
      .filter((l) => l.spendable >= shortfall);
  }, [financials, targetJarId, usedIds, total]);

  if (dismissed || ids.length === 0) return null;

  function handleUndo() {
    // Latch: drop a re-entrant double-tap that lands before the re-render hides the
    // banner, so `undo` never fires twice (mirrors the inFlight/committedRef guards
    // used in the Case-1/2 confirm paths of this same feature).
    if (undoing.current) return;
    undoing.current = true;
    autoFund.undo({ triggerTxnId, targetJarId, postedAt });
    setDismissed(true);
  }

  function handleSwap(donorJarId: string) {
    if (!targetJarId) return;
    const next = autoFund.changeSource({ triggerTxnId, targetJarId, postedAt, oldIds: ids, donorJarId });
    setIds(next);
    setNote("Đã đổi nguồn bù hũ.");
    setSwapOpen(false);
  }

  return (
    <div className="mx-5 mb-3 rounded-2xl border border-border bg-surface-tint px-3 py-2.5" role="status">
      <p className="text-[13px] text-text">
        Đã bù <span className="font-semibold tabular-nums">{formatVnd(total)}</span> từ {donorText} → {targetLabel}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-muted">{note}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleUndo}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text"
        >
          <RotateCcw size={13} aria-hidden /> Hoàn tác
        </button>
        {targetJarId && alternatives.length > 0 && (
          <button
            type="button"
            onClick={() => setSwapOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text"
          >
            <Repeat size={13} aria-hidden /> Đổi nguồn
          </button>
        )}
      </div>

      {swapOpen && (
        <Sheet title="Đổi nguồn bù hũ" description={`Bù ${formatVnd(total)} cho ${targetLabel} từ hũ khác`} onClose={() => setSwapOpen(false)}>
          <ul className="flex flex-col gap-2">
            {alternatives.map((a) => (
              <li key={a.huId}>
                <button
                  type="button"
                  onClick={() => handleSwap(a.huId)}
                  className="flex min-h-11 w-full items-center justify-between rounded-row border border-border bg-surface px-3 py-2 text-left text-sm text-text hover:bg-surface-muted"
                >
                  <span className="truncate">Hũ {a.label}</span>
                  <span className="tabular-nums text-muted">{formatVnd(a.spendable)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
