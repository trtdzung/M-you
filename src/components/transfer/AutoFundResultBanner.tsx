"use client";

import { useMemo, useRef, useState } from "react";
import { RotateCcw, Repeat } from "lucide-react";
import { formatVnd } from "@/lib/format";
import type { DonorProposal } from "@/domain/engine";
import { useAutoFund, type UndoResult } from "@/state/use-auto-fund";
import type { SwapResult } from "@/state/auto-fund-swap";
import { AutoFundSwapSheet } from "./AutoFundSwapSheet";

const sum = (donors: DonorProposal[]) => donors.reduce((s, d) => s + d.take, 0);
const names = (donors: DonorProposal[]) => donors.map((d) => d.label).join(", ") || "nguồn khác";

/** What the user is told after "Hoàn tác" (U12) — never a silent dismiss. */
function undoNote(r: UndoResult, targetLabel: string): string {
  if (r.status === "undone") return "Đã hoàn tác bù hũ.";
  if (r.status === "reapplied") return `Đã hoàn tác — tự bù lại từ ${names(r.donors)} ${formatVnd(sum(r.donors))} để ${targetLabel} không bị âm.`;
  const partial = r.donors.length > 0 ? `tự bù lại ${formatVnd(sum(r.donors))} từ ${names(r.donors)}; ` : "";
  return `Đã hoàn tác — ${partial}${targetLabel} còn thiếu ${formatVnd(r.shortfall)}, cần bù thủ công.`;
}

/** Why a swap was refused (the old legs stay intact). */
function swapRefusal(r: SwapResult): string {
  if (r.status === "needs-goal") return "Cần xác nhận trước khi rút từ hũ Mục tiêu.";
  if (r.status === "nothing") return "Hũ không còn thiếu — không cần đổi nguồn.";
  return "Không đổi được nguồn — hũ đã chọn không đủ tiền. Nguồn cũ được giữ nguyên.";
}

/**
 * Post-fund toast (plan 260918-1120, Phase 04): "Đã bù X từ <donor> → <target>"
 * with [Hoàn tác] (C4 — remove + re-validate, then SAY what happened: U12) and
 * [Đổi nguồn] (H1 — atomic swap; goal jars need a confirm step: S3; options come
 * from the trigger-month snapshot: G31; the donor label follows the swap: U23).
 * Every number comes from the engine via `useAutoFund` (invariant #1).
 */
export function AutoFundResultBanner({
  triggerTxnId,
  targetJarId,
  targetLabel,
  postedAt,
  donors: initialDonors,
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
  const [ids, setIds] = useState(createdIds);
  const [donors, setDonors] = useState(initialDonors);
  const [note, setNote] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const undoing = useRef(false);

  // G31: alternatives from the TRIGGER month (not the viewed month), with the
  // current legs excluded — exactly the basis `changeSource` validates against.
  const swap = useMemo(() => {
    if (!targetJarId || ids.length === 0) return { shortfall: 0, options: [] };
    const used = new Set(donors.map((d) => d.jarId));
    const r = autoFund.swapOptions({ triggerTxnId, targetJarId, postedAt, oldIds: ids });
    return { shortfall: r.shortfall, options: r.options.filter((o) => !used.has(o.jarId)) };
  }, [autoFund, triggerTxnId, targetJarId, postedAt, ids, donors]);

  function handleUndo() {
    // Latch: a re-entrant double-tap must never fire `undo` twice.
    if (undoing.current) return;
    undoing.current = true;
    const r = autoFund.undo({ triggerTxnId, targetJarId, postedAt });
    setUndone(true);
    setNote(undoNote(r, targetLabel));
    setIds(r.status === "undone" ? [] : r.createdIds);
    setDonors(r.status === "undone" ? [] : r.donors);
  }

  function handleSwap(donorJarId: string, confirmGoal: boolean) {
    if (!targetJarId) return;
    const r = autoFund.changeSource({ triggerTxnId, targetJarId, postedAt, oldIds: ids, donorJarId, confirmGoal });
    setSwapOpen(false);
    if (r.status !== "swapped" || !r.donor) return setNote(swapRefusal(r));
    setIds(r.ids);
    setDonors([r.donor]);
    setNote("Đã đổi nguồn bù hũ.");
  }

  const total = sum(donors);
  return (
    <div className="mx-5 mb-3 rounded-2xl border border-border bg-surface-tint px-3 py-2.5" role="status">
      {!undone && (
        <p className="text-[13px] text-text">
          Đã bù <span className="font-semibold tabular-nums">{formatVnd(total)}</span> từ {names(donors)} → {targetLabel}
        </p>
      )}
      {note && <p className={undone ? "text-[13px] text-text" : "mt-0.5 text-[11px] text-muted"}>{note}</p>}
      <div className="mt-2 flex gap-2 empty:hidden">
        {!undone && ids.length > 0 && (
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text"
          >
            <RotateCcw size={13} aria-hidden /> Hoàn tác
          </button>
        )}
        {targetJarId && swap.options.length > 0 && (
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
        <AutoFundSwapSheet
          shortfall={swap.shortfall}
          targetLabel={targetLabel}
          options={swap.options}
          onPick={handleSwap}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </div>
  );
}
