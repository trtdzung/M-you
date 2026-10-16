"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Transaction } from "@/domain/models";
import { Sheet } from "@/components/primitives";
import { CategoryOptionGrid } from "@/components/transactions/CategoryPickerSheet";
import { formatDate, formatVnd, formatVndCompact } from "@/lib/format";
import { useConfirmCategory, useCorrections } from "@/state/corrections";
import { useAutoFund } from "@/state/use-auto-fund";
import { typeForCategory } from "@/lib/category-txn-type";
import { cn } from "@/lib/cn";

/**
 * "Gắn nhãn chi tiêu" sheet: label current-month spend that left CASA without a
 * category. The list is `selectUnlabeledSpend(...).items` passed by the parent —
 * the SAME selector the overview card's count comes from (parity by
 * construction, RT#1). Picking a category funnels through `useConfirmCategory`
 * (the single accept/correct path, invariant #1) which promotes a user
 * correction and teaches memory; the engine then re-routes that spend into its
 * jar and the row drops out on the parent's next recompute.
 *
 * No AI/suggestion affordance and no consent gate here (RT#10): reuse only the
 * shared `CategoryOptionGrid` primitive.
 */
export function UnlabeledSpendSheet({
  items,
  onClose,
}: {
  items: Transaction[];
  onClose: () => void;
}) {
  const confirmCategory = useConfirmCategory();
  const { unsaved } = useCorrections();
  const autoFund = useAutoFund();
  // Which row's picker is open — keyed by `txn.id`, NEVER an array index (RT#7),
  // so a background/cross-tab recompute can't retarget it to a different txn.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [labeledNote, setLabeledNote] = useState(false);
  const [fundNote, setFundNote] = useState<string | null>(null);
  const [goalPending, setGoalPending] = useState<{ txn: Transaction; categoryId: string } | null>(null);
  // RT-fix (H1): commit-latch so a double-tap can't create two rebalances per label.
  const inFlight = useRef(false);

  /**
   * Label a spend, then auto-fund the target jar if the label pushes it over-budget
   * (Case 2). H4: the funding snapshot is the TRIGGER txn's period (`txn.postedAt`),
   * not the viewed month. `requiresManualGoal` prompts (C5 durable state on decline).
   */
  function labelSpend(txn: Transaction, categoryId: string, goalOk = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      confirmCategory(txn, categoryId);
      setActiveId(null);
      setFundNote(null);
      const result = autoFund.reconcile({
        triggerTxnId: txn.id,
        categoryId,
        postedAt: txn.postedAt,
        origin: "manual",
        includeGoal: goalOk,
        override: { categoryId, type: typeForCategory(categoryId) },
      });
      if (!result) return;
      if (result.status === "needs-goal") setGoalPending({ txn, categoryId });
      else if (result.status === "funded") {
        setGoalPending(null);
        const total = result.donors.reduce((s, d) => s + d.take, 0);
        setFundNote(`Đã bù ${formatVnd(total)} cho hũ ${result.targetLabel}.`);
      } else if (result.status === "insufficient") {
        setGoalPending(null);
        setFundNote(`Hũ ${result.targetLabel} vượt hạn mức — cần bù thủ công.`);
      } else setGoalPending(null);
    } finally {
      inFlight.current = false;
    }
  }

  // RT#6: if the open picker's row leaves `items` — labeled by background
  // auto-categorize or a cross-tab write while its picker was open — close the
  // picker and flag a transient note. Never write to a txn no longer unlabeled.
  useEffect(() => {
    if (activeId && !items.some((t) => t.id === activeId)) {
      setActiveId(null);
      setLabeledNote(true);
    }
  }, [items, activeId]);

  useEffect(() => {
    if (!labeledNote) return;
    const timer = window.setTimeout(() => setLabeledNote(false), 2500);
    return () => window.clearTimeout(timer);
  }, [labeledNote]);

  return (
    <Sheet
      title="Gắn nhãn chi tiêu"
      description="Các khoản tiêu từ TK chính chưa vào hũ. Chọn danh mục để đưa vào hũ tương ứng."
      onClose={onClose}
    >
      {unsaved && (
        <p role="alert" className="mb-3 rounded-row bg-warning-soft px-3 py-2 text-[13px] text-warning">
          Chưa lưu được — thử lại. Nhãn có thể chưa được lưu.
        </p>
      )}
      {labeledNote && (
        <p role="status" className="mb-3 rounded-row bg-surface-tint px-3 py-2 text-[13px] text-muted">
          Giao dịch đã được gắn nhãn.
        </p>
      )}
      {fundNote && (
        <p role="status" className="mb-3 rounded-row bg-surface-tint px-3 py-2 text-[13px] text-muted">
          {fundNote}
        </p>
      )}
      {goalPending && (
        <div className="mb-3 rounded-row border border-warning/40 bg-warning-soft/50 px-3 py-2.5" role="alertdialog">
          <p className="text-[13px] font-semibold text-warning">Cần rút từ hũ Mục tiêu để bù</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => labelSpend(goalPending.txn, goalPending.categoryId, true)}
              className="flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
            >
              Xác nhận rút
            </button>
            <button
              type="button"
              onClick={() => {
                setGoalPending(null);
                setFundNote("Chưa bù — hũ đang vượt hạn mức, cần bù thủ công.");
              }}
              className="flex-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text"
            >
              Để sau
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Đã gắn nhãn hết 🎉</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((txn) => (
            <li key={txn.id} className="rounded-card border border-border bg-surface">
              <button
                type="button"
                onClick={() => setActiveId((cur) => (cur === txn.id ? null : txn.id))}
                aria-expanded={activeId === txn.id}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text">
                    {txn.merchantName || txn.merchantNormalizedName}
                  </div>
                  <div className="text-[11px] text-muted">{formatDate(txn.postedAt)}</div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-text">{formatVndCompact(txn.amount)}</div>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={cn("shrink-0 text-muted transition-transform", activeId === txn.id && "rotate-180")}
                />
              </button>
              {activeId === txn.id && (
                <div className="border-t border-border p-3">
                  <CategoryOptionGrid
                    kind="expense"
                    onSelect={(categoryId) => labelSpend(txn, categoryId)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
