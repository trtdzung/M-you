import { formatVnd } from "@/lib/format";
import type { DonorProposal } from "@/domain/engine";

const sum = (donors: DonorProposal[]) => donors.reduce((s, d) => s + d.take, 0);
const names = (donors: DonorProposal[]) => donors.map((d) => d.label).join(", ") || "nguồn khác";

/**
 * Post-fund notice (plan 260918-1120, Phase 04): "Đã bù X từ <donor> → <target>".
 *
 * READ-ONLY. It reports what the engine already did and offers no action: the
 * earlier [Hoàn tác] / [Đổi nguồn] pair was removed along with the whole
 * undo/swap mechanic, so this component no longer holds state or touches
 * `useAutoFund`. A rebalance is corrected by re-categorising the trigger txn
 * (which re-runs `reconcile`), not by editing the legs from here.
 *
 * Every number comes from the engine via the `FundResult` the caller passes
 * (invariant #1); this never computes.
 */
export function AutoFundResultBanner({
  targetLabel,
  donors,
}: {
  targetLabel: string;
  donors: DonorProposal[];
}) {
  return (
    <div className="mx-5 mb-3 rounded-2xl border border-border bg-surface-tint px-3 py-2.5" role="status">
      <p className="text-[13px] text-text">
        Đã bù <span className="font-semibold tabular-nums">{formatVnd(sum(donors))}</span> từ {names(donors)} → {targetLabel}
      </p>
    </div>
  );
}
