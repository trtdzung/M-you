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
 * number that is at once its allocation, its ceiling and its balance. This is a
 * "số tổng mới" editor, NOT a top-up: every input is PREFILLED with the jar's
 * current limit, so editing one jar never wipes another's (red-team C1). It moves
 * NO real money — a pure display partition of the CASA balance (invariant #3).
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
  // Prefill each jar with its current budgetLimit (0 = chưa đặt). Editing a row
  // sets that jar's NEW total limit; other rows keep their prefilled value.
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(jars.map((j) => [j.id, j.budgetLimit ?? 0])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const poolKnown = pending.pool !== "unknown";
  const pool = poolKnown ? (pending.pool as number) : 0;
  const allocated = useMemo(() => Object.values(draft).reduce((s, n) => s + (n || 0), 0), [draft]);
  // Live headroom as the user edits. At open (draft = current limits) this equals
  // `pending.amount` by construction — the "Chờ phân bổ" card the CTA came from
  // shows the same number, so "Chia ngay 13tr" can't land on "còn 200k".
  const leftToSplit = pool - allocated;
  const changed = useMemo(
    () => jars.some((j) => (draft[j.id] ?? 0) !== (j.budgetLimit ?? 0)),
    [draft, jars],
  );
  const canSubmit = poolKnown && leftToSplit >= 0 && changed && !submitting;

  async function submit() {
    setError(false);
    setSubmitting(true);
    try {
      // Only send jars whose limit actually changed. 0 → clear back to "chưa đặt"
      // (invariant #6: an empty limit is unknown, never a stored 0).
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
    <Sheet title="Đặt hạn mức cho hũ" description="Đặt hạn mức mỗi hũ — hạn mức là số dư hiển thị. Không chuyển tiền, không cần OTP." onClose={onClose}>
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
