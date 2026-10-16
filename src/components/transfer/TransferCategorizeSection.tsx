"use client";

import { useState } from "react";
import { ChevronRight, Tag } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { CategoryOptionGrid } from "@/components/transactions/CategoryPickerSheet";
import { TransferPurposeSuggestionBanner } from "./TransferPurposeSuggestionBanner";
import { useJarConfig } from "@/state/jars";
import { useManualTxns } from "@/state/manual-txns";
import { useTransferPurposeSuggestion } from "@/state/use-transfer-purpose-suggestion";
import { typeForCategory } from "@/lib/category-txn-type";
import {
  CATEGORY,
  CATEGORY_BY_ID,
  TRANSFER_PURPOSES,
  isSpendingPurpose,
  purposeCategoryId,
  transferPurposeLabel,
} from "@/domain/models";

/**
 * Optional "Phân loại giao dịch" section on the transfer success card. It edits
 * the category of the ONE self-reported (primary) txn recorded on confirm (never
 * money movement — invariant #3). No jar bookkeeping is needed here any more: a
 * jar's spendable is DERIVED from txn history (invariant #1), so changing the
 * txn's category alone re-routes `spent`/`remaining` between jars via
 * `evaluateJarBudget`'s category→jar map — no double count, nothing to refund.
 *
 * Transfer PURPOSE layer (separate taxonomy): while the transfer is still
 * unclassified, AI *suggests* a purpose (pending — invariant #6). Accepting a
 * `spending` purpose reclassifies into its mapped expense category (flipping the
 * txn to expense, via the same path as a manual pick); a non-spending purpose
 * stays `type:"transfer"` and only records `transferPurpose` metadata. Nothing
 * here mutates the record until the USER taps a choice.
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
  const { manualTxns, update: updateManualTxn } = useManualTxns();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  // Read the CURRENT record from the store — never recompute an independent
  // default (avoids drift with the real txn, Red Team F#7).
  const currentTxn = manualTxns.find((t) => t.id === txnId);
  const currentCategoryId = currentTxn?.categoryId ?? CATEGORY.transfer;
  const currentPurposeId = currentTxn?.transferPurpose;
  const isUnclassified = currentCategoryId === CATEGORY.transfer && !currentPurposeId;
  // Prefer the purpose label for a non-spending purpose (categoryId stays
  // transfer); otherwise show the category label.
  const currentLabel =
    currentPurposeId && currentCategoryId === CATEGORY.transfer
      ? transferPurposeLabel(currentPurposeId)
      : currentCategoryId === CATEGORY.transfer
        ? "Chưa phân loại"
        : CATEGORY_BY_ID[currentCategoryId]?.label ?? "Chưa phân loại";
  const sourceJar = sourceJarId ? jarConfig.jars.find((j) => j.id === sourceJarId) ?? null : null;

  // Pending AI/heuristic purpose guess, shown only while unclassified.
  const { suggestion } = useTransferPurposeSuggestion({
    txnId,
    recipientName: currentTxn?.merchantName ?? "",
    note: currentTxn?.note,
    amount,
    enabled: Boolean(currentTxn) && isUnclassified,
  });

  /**
   * Set category (+ optional purpose). The category change alone re-routes this
   * txn's spend between jars (derived model, invariant #1) — no jar bookkeeping.
   */
  function applyCategory(categoryId: string, purposeId?: string) {
    const nextType = typeForCategory(categoryId);
    // Always send transferPurpose so a plain category pick (purposeId omitted)
    // CLEARS a previously-accepted purpose — otherwise stale metadata lingers,
    // the label stays wrong, and the txn never looks unclassified again.
    const ok = updateManualTxn(txnId, { categoryId, type: nextType, transferPurpose: purposeId });
    if (!ok) {
      setPickError("Không cập nhật được phân loại. Vui lòng thử lại.");
      return;
    }
    setPickError(null);
    setPickerOpen(false);
    setPurposeOpen(false);
  }

  function handlePick(categoryId: string) {
    applyCategory(categoryId);
  }

  /**
   * Apply a user-chosen PURPOSE. A spending purpose reclassifies into its mapped
   * expense category (counts + jar sync); a non-spending one stays a transfer and
   * only records metadata (invariant #6 — no number moves without this consent).
   */
  function applyPurpose(purposeId: string) {
    const spending = isSpendingPurpose(purposeId);
    const mapped = spending ? purposeCategoryId(purposeId) : undefined;
    if (spending && !mapped) {
      setPickError("Không cập nhật được phân loại. Vui lòng thử lại.");
      return;
    }
    applyCategory(mapped ?? CATEGORY.transfer, purposeId);
  }

  return (
    <>
      <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-text">Phân loại giao dịch</p>
          <p className="text-[11px] text-muted">Tuỳ chọn · tự khai báo</p>
        </div>

        {suggestion && (
          <TransferPurposeSuggestionBanner
            suggestion={suggestion}
            onAccept={() => applyPurpose(suggestion.purposeId)}
            onChooseOther={() => {
              setPickError(null);
              setPurposeOpen(true);
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
      </div>

      {pickerOpen && (
        <Sheet title="Phân loại giao dịch" description="Tự khai báo" onClose={() => setPickerOpen(false)}>
          {sourceJar ? (
            <CategoryOptionGrid selectedId={currentCategoryId} allowedCategoryIds={sourceJar.categoryIds} onSelect={handlePick} />
          ) : (
            <CategoryOptionGrid
              selectedId={currentCategoryId}
              kind="expense"
              uncategorizedOption={{ id: CATEGORY.transfer, label: "Không phân loại" }}
              onSelect={handlePick}
            />
          )}
        </Sheet>
      )}

      {purposeOpen && (
        <Sheet title="Mục đích chuyển tiền" description="Tự khai báo" onClose={() => setPurposeOpen(false)}>
          <div className="flex flex-col gap-1.5 px-1 pb-2">
            {TRANSFER_PURPOSES.map((p) => {
              const selected = p.id === currentPurposeId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPurpose(p.id)}
                  className={`flex min-h-11 items-center gap-2 rounded-row border px-3 py-2 text-left text-sm transition-colors ${
                    selected ? "border-brand bg-brand/5 text-text" : "border-border bg-surface text-text hover:bg-surface-muted"
                  }`}
                >
                  <span className="flex-1">{p.label}</span>
                  {p.spending && <span className="text-[11px] text-muted">tính vào chi tiêu</span>}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </>
  );
}
