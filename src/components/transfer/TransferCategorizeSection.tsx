"use client";

import { useState } from "react";
import { ChevronRight, Tag } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { CategoryOptionGrid } from "@/components/transactions/CategoryPickerSheet";
import { useJarConfig } from "@/state/jars";
import { useManualTxns } from "@/state/manual-txns";
import { typeForCategory } from "@/lib/category-txn-type";
import { CATEGORY, CATEGORY_BY_ID } from "@/domain/models";

/**
 * Optional "Phân loại giao dịch" section on the transfer success card. It edits
 * the category of the ONE self-reported txn recorded on confirm (never money
 * movement — invariant #3) and keeps the affected jar's "Thực tế" in sync with
 * "Ngân sách": re-categorizing into a jar-owned expense debits that jar
 * (`spendFromJar`); switching away refunds it (F#5, "trừ luôn hũ").
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
  const [pickError, setPickError] = useState<string | null>(null);
  // The jar whose "Thực tế" is currently charged for this txn. Seeded from the
  // jar confirm() already debited so a later refund targets the right jar (F#5).
  const [appliedJarId, setAppliedJarId] = useState<string | null>(sourceJarId);

  // Read the CURRENT category from the stored record — never recompute an
  // independent default (avoids drift with the real txn, Red Team F#7).
  const currentTxn = manualTxns.find((t) => t.id === txnId);
  const currentCategoryId = currentTxn?.categoryId ?? CATEGORY.transfer;
  const currentCategoryLabel =
    currentCategoryId === CATEGORY.transfer
      ? "Chưa phân loại"
      : CATEGORY_BY_ID[currentCategoryId]?.label ?? "Chưa phân loại";
  const sourceJar = sourceJarId ? jarConfig.jars.find((j) => j.id === sourceJarId) ?? null : null;

  /** The jar (if any) that owns a category — used to keep "Thực tế" in sync (F#5). */
  function jarOfCategory(categoryId: string): string | null {
    return jarConfig.jars.find((j) => j.categoryIds.includes(categoryId))?.id ?? null;
  }

  function handlePick(categoryId: string) {
    const nextType = typeForCategory(categoryId);
    const ok = updateManualTxn(txnId, { categoryId, type: nextType });
    if (!ok) {
      setPickError("Không cập nhật được phân loại. Vui lòng thử lại.");
      return;
    }
    const nextJarId = nextType === "expense" ? jarOfCategory(categoryId) : null;
    if (nextJarId !== appliedJarId) {
      if (appliedJarId) spendFromJar(appliedJarId, -amount); // refund old jar (see clamp caveat)
      if (nextJarId) spendFromJar(nextJarId, amount); // charge new jar
      setAppliedJarId(nextJarId);
    }
    setPickError(null);
    setPickerOpen(false);
  }

  return (
    <>
      <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-text">Phân loại giao dịch</p>
          <p className="text-[11px] text-muted">Tuỳ chọn · tự khai báo</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPickError(null);
            setPickerOpen(true);
          }}
          className="flex min-h-11 items-center gap-2 rounded-row border border-border bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-muted"
        >
          <Tag size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="flex-1 truncate">{currentCategoryLabel}</span>
          <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
        </button>
        {pickError && <p className="text-xs text-negative">{pickError}</p>}
      </div>

      {pickerOpen && (
        <Sheet
          title="Phân loại giao dịch"
          description="Tự khai báo"
          onClose={() => setPickerOpen(false)}
        >
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
    </>
  );
}
