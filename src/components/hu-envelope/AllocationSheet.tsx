"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/primitives";
import { InsufficientData } from "@/components/states";
import { buildAllocationRows, type JarEnvelopeResult } from "@/domain/engine";
import type { Jar } from "@/domain/models";
import { jarAccent } from "@/lib/category-colors";
import { formatVndCompact } from "@/lib/format";
import { useJarAllocations } from "@/state/jar-allocations";
import { AllocationJarRow } from "./AllocationJarRow";

/**
 * "Chia ngay" bottom sheet: distribute the period's unallocated income into
 * jars. Fully deterministic, no AI, and it moves NO real money — it only records
 * envelope allocations of money already in the user's accounts (invariant #3).
 * The FIFO mapping to txn-keyed rows is the pure `buildAllocationRows`; this
 * component holds the draft, enforces Σ ≤ pending as a guardrail (the store
 * re-validates), and submits via `useJarAllocations`.
 */
export function AllocationSheet({
  envelope,
  jars,
  onClose,
}: {
  envelope: JarEnvelopeResult;
  /** Jar config, for label/accent per row (presentation). */
  jars: Jar[];
  onClose: () => void;
}) {
  const { allocate } = useJarAllocations();
  const { pending } = envelope;
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const pendingAmount = pending.amount === "unknown" ? 0 : pending.amount;
  const allocated = useMemo(() => Object.values(draft).reduce((s, n) => s + (n || 0), 0), [draft]);
  const leftToSplit = pendingAmount - allocated;
  const canSubmit = allocated > 0 && leftToSplit >= 0 && !submitting;

  async function submit() {
    setError(false);
    setSubmitting(true);
    try {
      const rows = buildAllocationRows(pending.perTxn, draft);
      await allocate(rows);
      onClose();
    } catch {
      setError(true); // keep the draft so the user can retry
      setSubmitting(false);
    }
  }

  return (
    <Sheet title="Chia thu nhập vào hũ" description="Phân bổ tiền đã nhận — không chuyển tiền, không cần OTP." onClose={onClose}>
      {pending.amount === "unknown" ? (
        <InsufficientData description="Chưa có dữ liệu thu nhập trong kỳ để phân bổ." />
      ) : pendingAmount <= 0 ? (
        <p className="py-4 text-center text-sm text-muted">Đã phân bổ hết thu nhập trong kỳ. Không còn gì để chia.</p>
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
                funded={envelope.jars.find((l) => l.jarId === jar.id)?.funded ?? null}
                value={draft[jar.id] ?? 0}
                onChange={(next) => setDraft((d) => ({ ...d, [jar.id]: next }))}
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-sm text-negative">
              Lưu phân bổ thất bại. Vui lòng thử lại.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {submitting ? "Đang chia…" : "Chia"}
          </button>
        </div>
      )}
    </Sheet>
  );
}
