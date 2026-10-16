"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import type { SwapOption } from "@/state/auto-fund-swap";

/**
 * "Đổi nguồn bù hũ" picker (H1). Options come from `useAutoFund().swapOptions` —
 * the trigger-month snapshot `changeSource` itself uses (G31). A protected goal
 * jar is listed but tapping it opens an explicit confirm step first (S3/G26):
 * `onPick(jarId, true)` is only ever called from that confirm.
 */
export function AutoFundSwapSheet({
  shortfall,
  targetLabel,
  options,
  onPick,
  onClose,
}: {
  shortfall: number;
  targetLabel: string;
  options: SwapOption[];
  onPick: (jarId: string, confirmGoal: boolean) => void;
  onClose: () => void;
}) {
  const [goalAsk, setGoalAsk] = useState<SwapOption | null>(null);

  return (
    <Sheet title="Đổi nguồn bù hũ" description={`Bù ${formatVnd(shortfall)} cho ${targetLabel} từ hũ khác`} onClose={onClose}>
      {goalAsk ? (
        <div className="rounded-row border border-warning/40 bg-warning-soft/50 p-3" role="alertdialog" aria-label="Xác nhận rút hũ Mục tiêu">
          <p className="text-sm font-semibold text-warning">Rút từ hũ Mục tiêu {goalAsk.label}?</p>
          <p className="mt-1 text-xs text-warning">
            Hũ Mục tiêu được bảo vệ. Rút {formatVnd(shortfall)} sẽ làm chậm mục tiêu này. Bạn xác nhận?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onPick(goalAsk.jarId, true)}
              className="flex-1 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-white"
            >
              Xác nhận rút
            </button>
            <button
              type="button"
              onClick={() => setGoalAsk(null)}
              className="flex-1 rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold text-text"
            >
              Huỷ
            </button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((a) => (
            <li key={a.jarId}>
              <button
                type="button"
                onClick={() => (a.isGoal ? setGoalAsk(a) : onPick(a.jarId, false))}
                className="flex min-h-11 w-full items-center justify-between rounded-row border border-border bg-surface px-3 py-2 text-left text-sm text-text hover:bg-surface-muted"
              >
                <span className="truncate">
                  Hũ {a.label}
                  {a.isGoal && <span className="ml-1.5 text-[11px] text-warning">· Mục tiêu</span>}
                </span>
                <span className="tabular-nums text-muted">{formatVnd(a.spendable)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
