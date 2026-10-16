import { formatVnd } from "@/lib/format";
import type { FundResult } from "@/state/use-auto-fund";

/**
 * The one-line Case-2 feedback after a label/re-label reconciles its jar (shared
 * by `TransferCategorizeSection` and `UnlabeledSpendSheet`). A PARTIAL cover
 * (U5: `insufficient` with legs written) states both what was covered and what
 * is still short — never "Đã bù" alone, never a silent loss. `null` = nothing to say.
 */
export function fundOutcomeNote(result: FundResult): string | null {
  const covered = result.donors.reduce((s, d) => s + d.take, 0);
  if (result.status === "funded") return `Đã bù ${formatVnd(covered)} cho hũ ${result.targetLabel}.`;
  if (result.status !== "insufficient") return null;
  if (result.createdIds.length > 0) {
    return `Đã bù ${formatVnd(covered)} cho hũ ${result.targetLabel} — còn thiếu ${formatVnd(result.shortfall)}, cần bù thủ công.`;
  }
  return `Hũ ${result.targetLabel} vượt hạn mức — cần bù thủ công.`;
}
