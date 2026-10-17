"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/primitives";
import { InsufficientData } from "@/components/states";
import type { JarEnvelopeResult } from "@/domain/engine";
import type { Jar } from "@/domain/models";
import { jarAccent } from "@/lib/category-colors";
import { formatVndCompact } from "@/lib/format";
import { useJarConfig } from "@/state/jars";
import { AllocationJarRow } from "./AllocationJarRow";

/**
 * "Chia ngay" bottom sheet: set each jar's **hạn mức** (`budgetLimit`) — the one
 * number that is at once its allocation, its ceiling and its balance. It moves NO
 * real money — a pure display partition of the CASA balance (invariant #3).
 *
 * DIVIDE-FROM-SCRATCH: every input opens at 0 and "Còn lại để chia" opens at the
 * FULL CASA balance, so the sheet always states the same thing it does: you are
 * splitting the whole balance again. It is deliberately NOT prefilled with the
 * current limits — a prefilled sheet left a leftover remainder sitting in "Còn
 * lại để chia" (e.g. 880K) that read as an error rather than as unallocated
 * money. A jar left at 0 therefore ends up "chưa đặt hạn mức", and its previous
 * limit is shown beside the input as reference only.
 *
 * Because an untouched sheet would otherwise wipe every limit, `canSubmit`
 * requires at least one jar to carry a positive amount — opening the sheet and
 * hitting "Lưu hạn mức" straight away can never clear the whole config.
 *
 * Guardrail: Σ (hạn mức mới của mọi hũ) ≤ CASA pool. The server re-checks and
 * rejects 422 if exceeded (client check is UX). Writes atomically via
 * `updateJars` (one transaction, one `setConfig`).
 */
export function AllocationSheet({
  envelope,
  jars,
  onClose,
}: {
  envelope: JarEnvelopeResult;
  /** Jar config, for label/accent/current limit per row. */
  jars: Jar[];
  onClose: () => void;
}) {
  const { updateJars } = useJarConfig();
  const { pending } = envelope;
  // Every jar opens at 0: this sheet divides the whole balance again rather than
  // topping up the existing split. A row left at 0 is saved as "chưa đặt hạn mức".
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(jars.map((j) => [j.id, 0])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const poolKnown = pending.pool !== "unknown";
  const pool = poolKnown ? (pending.pool as number) : 0;
  const allocated = useMemo(() => Object.values(draft).reduce((s, n) => s + (n || 0), 0), [draft]);
  // Live headroom as the user edits. At open (every row 0) this is the FULL CASA
  // balance — the sheet divides everything again, so there is never a leftover
  // remainder carried in from the previous split.
  const leftToSplit = pool - allocated;
  // A sheet nobody typed into must not be savable: it would clear every limit.
  const canSubmit = poolKnown && leftToSplit >= 0 && allocated > 0 && !submitting;

  async function submit() {
    setError(false);
    setSubmitting(true);
    try {
      // Only send jars whose limit actually changed — a jar left at 0 that had no
      // limit is skipped, a jar left at 0 that HAD one is cleared back to "chưa
      // đặt" (invariant #6: an empty limit is unknown, never a stored 0).
      const patches: Record<string, { budgetLimit: number | undefined }> = {};
      for (const jar of jars) {
        const next = draft[jar.id] ?? 0;
        if (next === (jar.budgetLimit ?? 0)) continue;
        patches[jar.id] = { budgetLimit: next > 0 ? next : undefined };
      }
      await updateJars(patches);
      onClose();
    } catch {
      setError(true); // keep the draft so the user can retry
      setSubmitting(false);
    }
  }

  return (
    <Sheet title="Đặt hạn mức cho hũ" description="Chia lại toàn bộ số dư — hạn mức là số dư hiển thị. Hũ để trống sẽ thành chưa đặt hạn mức. Không chuyển tiền, không cần OTP." onClose={onClose}>
      {!poolKnown ? (
        <InsufficientData description="Chưa có số dư tài khoản để phân bổ." />
      ) : (
        <div className="flex flex-col gap-1">
          <div className="mb-2 flex items-center justify-between rounded-xl bg-surface-tint px-3 py-2 text-sm">
            <span className="text-muted">Còn lại để chia</span>
            <span className={`font-semibold ${leftToSplit < 0 ? "text-negative" : "text-text"}`}>
              {formatVndCompact(leftToSplit)}
            </span>
          </div>

          <div className="divide-y divide-border">
            {jars.map((jar) => (
              <AllocationJarRow
                key={jar.id}
                label={jar.label}
                accent={jarAccent(jar)}
                currentLimit={jar.budgetLimit ?? null}
                value={draft[jar.id] ?? 0}
                onChange={(next) => setDraft((d) => ({ ...d, [jar.id]: next }))}
              />
            ))}
          </div>

          {leftToSplit < 0 && (
            <p role="alert" className="mt-2 text-sm text-negative">
              Tổng hạn mức vượt quá số dư. Giảm bớt để tổng ≤ số dư.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-negative">
              Lưu hạn mức thất bại. Vui lòng thử lại.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {submitting ? "Đang lưu…" : "Lưu hạn mức"}
          </button>
        </div>
      )}
    </Sheet>
  );
}
