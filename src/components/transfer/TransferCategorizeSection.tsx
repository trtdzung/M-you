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
 * the category of the ONE self-reported txn recorded on confirm (never money
 * movement — invariant #3) and keeps the affected jar's "Thực tế" in sync with
 * "Ngân sách": re-categorizing into a jar-owned expense debits that jar
 * (`spendFromJar`); switching away refunds it (F#5, "trừ luôn hũ").
 *
 * Transfer PURPOSE layer (separate taxonomy): while the transfer is still
 * unclassified, AI *suggests* a purpose (pending — invariant #6). Accepting a
 * `spending` purpose reclassifies into its mapped expense category (flipping the
 * txn to expense + jar sync, via the same path as a manual pick); a non-spending
 * purpose stays `type:"transfer"` and only records `transferPurpose` metadata.
 * Nothing here mutates the record until the USER taps a choice.
 *
 * `sourceJarId` is the jar already debited in `confirm()` (null for an
 * account-sourced transfer) — it seeds `appliedJarId` so the first refund
 * targets the right jar, matching what `confirm()` actually charged.
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
  const { config: jarConfig, spendFromJar } = useJarConfig();
  const { manualTxns, update: updateManualTxn } = useManualTxns();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // The jar whose "Thực tế" is currently charged for this txn, and the amount it
  // was actually debited. Seeded from the jar confirm() already debited (the full
  // amount — transfer sourcing validated funds) so a later refund targets the
  // right jar for the right amount (F#5).
  const [appliedJarId, setAppliedJarId] = useState<string | null>(sourceJarId);
  const [appliedDebit, setAppliedDebit] = useState<number>(sourceJarId ? amount : 0);

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

  /** The jar (if any) that owns a category — used to keep "Thực tế" in sync (F#5). */
  function jarOfCategory(categoryId: string): string | null {
    return jarConfig.jars.find((j) => j.categoryIds.includes(categoryId))?.id ?? null;
  }

  /** Set category (+ optional purpose) and keep the charged jar in sync (F#5). */
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
    const nextJarId = nextType === "expense" ? jarOfCategory(categoryId) : null;
    if (nextJarId !== appliedJarId) {
      // Refund EXACTLY what was debited. `spendFromJar` clamps at 0, so a charge
      // against an underfunded jar debits less than `amount`; a blind -amount
      // refund would inflate that jar's real spendable balance (invariant #6).
      if (appliedJarId) spendFromJar(appliedJarId, -appliedDebit);
      let charged = 0;
      if (nextJarId) {
        const jar = jarConfig.jars.find((j) => j.id === nextJarId);
        charged = jar ? Math.min(amount, Math.max(0, jar.actualAmount ?? 0)) : amount;
        spendFromJar(nextJarId, amount); // spendFromJar clamps internally to the same value
      }
      setAppliedJarId(nextJarId);
      setAppliedDebit(charged);
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
