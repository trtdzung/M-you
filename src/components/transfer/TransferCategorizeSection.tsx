"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, Tag } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { CategoryOptionGrid } from "@/components/transactions/CategoryPickerSheet";
import { TransferCategorySuggestionBanner } from "./TransferCategorySuggestionBanner";
import { useCategories } from "@/state/categories";
import { useJarConfig } from "@/state/jars";
import { useManualTxns } from "@/state/manual-txns";
import { useAutoFund } from "@/state/use-auto-fund";
import { useTransferCategorySuggestion } from "@/state/use-transfer-category-suggestion";
import { typeForCategory } from "@/lib/category-txn-type";
import { fundOutcomeNote } from "./fund-outcome-note";
import { CATEGORY, categoryLabel } from "@/domain/models";

/**
 * Optional "Phân loại giao dịch" section on the transfer success card. It edits
 * the category of the ONE self-reported (primary) txn recorded on confirm (never
 * money movement — invariant #3). No jar bookkeeping is needed here: a jar's
 * spendable is DERIVED from txn history (invariant #1), so changing the txn's
 * category alone re-routes `spent`/`balance` between jars via
 * `evaluateJarBudget`'s category→jar map — no double count, nothing to refund.
 *
 * AI category layer: while the transfer is still unclassified, the AI (or the
 * local heuristic) *suggests* one of the persona's spending categories — pending
 * (invariant #6). A transfer is not automatically a spend, so accepting is the
 * user's explicit "this transfer was really a purchase": it flips the txn
 * transfer→expense (via the same path as a manual pick) and routes the spend to
 * the owning jar. Nothing here mutates the record until the USER taps a choice.
 *
 * `sourceJarId` is the jar this transfer sourced from (null for an
 * account/pool-sourced transfer) — it constrains the category picker to that
 * jar's categories.
 */
export function TransferCategorizeSection({
  txnId,
  sourceJarId,
  amount,
}: {
  txnId: string;
  sourceJarId: string | null;
  amount: number;
}) {
  const { config: jarConfig } = useJarConfig();
  // Taxonomy của persona: `byId` để hiện nhãn + suy ra `type`, `assignable` để
  // chặn gán vào danh mục đã ẩn và để validate gợi ý của model.
  const { byId: categoryById, labels, assignable } = useCategories();
  const assignableIds = useMemo(() => new Set(assignable.map((c) => c.id)), [assignable]);
  const { manualTxns, update: updateManualTxn } = useManualTxns();
  const autoFund = useAutoFund();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // Auto-fund feedback for Case 2 (categorize-later routes the spend into a jar).
  const [fundNote, setFundNote] = useState<string | null>(null);
  // RT-fix (H1): a commit-latch so a double-tap can't create two rebalances for one label.
  const inFlight = useRef(false);

  // Read the CURRENT record from the store — never recompute an independent
  // default (avoids drift with the real txn, Red Team F#7).
  const currentTxn = manualTxns.find((t) => t.id === txnId);
  const currentCategoryId = currentTxn?.categoryId ?? CATEGORY.transfer;
  const isUnclassified = currentCategoryId === CATEGORY.transfer;
  // A still-transfer txn reads "Chưa phân loại"; any real category (incl. one no
  // longer in the active taxonomy) renders its label — the txn IS labelled,
  // never mislabelled "Chưa phân loại" (invariant #5).
  const currentLabel = isUnclassified ? "Chưa phân loại" : categoryLabel(currentCategoryId, labels);
  const sourceJar = sourceJarId ? jarConfig.jars.find((j) => j.id === sourceJarId) ?? null : null;

  // Pending AI/heuristic category guess, shown only while unclassified.
  const { suggestion } = useTransferCategorySuggestion({
    txnId,
    recipientName: currentTxn?.merchantName ?? "",
    note: currentTxn?.note,
    amount,
    assignableIds,
    enabled: Boolean(currentTxn) && isUnclassified,
  });

  /**
   * Set the category. The change alone re-routes this txn's spend between jars
   * (derived model, invariant #1) — no jar bookkeeping.
   */
  function applyCategory(categoryId: string) {
    if (inFlight.current) return; // H1 latch — one label, one rebalance
    inFlight.current = true;
    try {
      const nextType = typeForCategory(categoryId, categoryById);
      const ok = updateManualTxn(txnId, { categoryId, type: nextType });
      if (!ok) {
        setPickError("Không cập nhật được phân loại. Vui lòng thử lại.");
        return;
      }
      setPickError(null);
      setPickerOpen(false);
      setFundNote(null);

      // Case 2 (tiêu trước, phân loại sau): the new category may route this spend
      // into a jar that's now over-budget. Unwind any prior rebalance (H5) and
      // re-fund the residual overspend from the waterfall on the TRIGGER period
      // (H4 — derive the snapshot from the txn's own date, not the viewed month).
      const postedAt = currentTxn?.postedAt ?? new Date().toISOString();
      const result = autoFund.reconcile({
        triggerTxnId: txnId,
        categoryId,
        postedAt,
        origin: "manual",
        override: { categoryId, type: nextType },
      });
      // funded / partial-insufficient (U5: covered part + residual) / covered.
      // C5 durable state: an uncovered residual keeps the jar over-budget and
      // re-surfaces as "cần bù thủ công" on its card — never a silent loss.
      if (result) setFundNote(fundOutcomeNote(result));
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-text">Phân loại giao dịch</p>
          <p className="text-[11px] text-muted">Tuỳ chọn · tự khai báo</p>
        </div>

        {suggestion && (
          <TransferCategorySuggestionBanner
            suggestion={suggestion}
            label={categoryLabel(suggestion.categoryId, labels)}
            onAccept={() => applyCategory(suggestion.categoryId)}
            onChooseOther={() => {
              setPickError(null);
              setPickerOpen(true);
            }}
          />
        )}

        <button
          type="button"
          onClick={() => {
            setPickError(null);
            setPickerOpen(true);
          }}
          className="flex min-h-11 items-center gap-2 rounded-row border border-border bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-muted"
        >
          <Tag size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="flex-1 truncate">{currentLabel}</span>
          <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
        </button>
        {pickError && <p className="text-xs text-negative">{pickError}</p>}
        {fundNote && <p className="text-xs text-muted">{fundNote}</p>}
      </div>

      {pickerOpen && (
        <Sheet title="Phân loại giao dịch" description="Tự khai báo" onClose={() => setPickerOpen(false)}>
          {sourceJar ? (
            <CategoryOptionGrid selectedId={currentCategoryId} allowedCategoryIds={sourceJar.categoryIds} onSelect={applyCategory} />
          ) : (
            <CategoryOptionGrid
              selectedId={currentCategoryId}
              kind="expense"
              uncategorizedOption={{ id: CATEGORY.transfer, label: "Không phân loại" }}
              onSelect={applyCategory}
            />
          )}
        </Sheet>
      )}
    </>
  );
}
