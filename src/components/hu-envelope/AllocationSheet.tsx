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
 * ADD-TO-JAR: "Còn lại để chia" opens at the residual the overview shows —
 * `CASA − Σ hạn mức hiện có`, i.e. exactly the "Chờ phân bổ" the "Chia ngay →" CTA
 * came from (`PendingAllocationCard`, `jarEnvelope.pending`). Every input opens at
 * 0 and is the amount to ADD to that jar, so the user HANDS OUT the leftover into
 * jars instead of rewriting each jar's full total (a prefilled total like 8.100.000
 * read as "edit the whole number", not "top up"). New limit = hạn mức hiện có +
 * số cộng thêm; the leftover shrinks as it is handed out. This sheet only tops up —
 * it never lowers or clears a jar's limit.
 *
 * Hitting "Lưu hạn mức" without adding anything is a no-op — `canSubmit` requires
 * a positive total added, so an untouched sheet changes nothing.
 *
 * Guardrail: Σ (hạn mức mới của mọi hũ) ≤ CASA pool, i.e. tổng cộng thêm ≤ phần
 * còn lại. The server re-checks and rejects 422 if exceeded (client check is UX).
 * Writes atomically via `updateJars` (one transaction, one `setConfig`).
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
  // Every jar opens at 0 — the input is the amount to ADD to that jar, not its new
  // total. New limit = hạn mức hiện có + số cộng thêm (computed on submit), so the
  // user distributes the leftover rather than rewriting each full total.
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(jars.map((j) => [j.id, 0])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const poolKnown = pending.pool !== "unknown";
  const pool = poolKnown ? (pending.pool as number) : 0;
  // Each jar's current balance (`remaining`) from the engine — a null (no limit) or
  // overspent jar contributes 0 spendable. BALANCE LENS: leftToSplit = CASA − Σ new
  // spendable, where adding Δ to a jar makes its spendable `max(0, remaining + Δ)`.
  const remainingByJar = useMemo(
    () => new Map(envelope.jars.map((l) => [l.jarId, l.remaining ?? 0])),
    [envelope.jars],
  );
  const added = useMemo(() => Object.values(draft).reduce((s, n) => s + (n || 0), 0), [draft]);
  // Live leftover as the user hands money out. At open (nothing added) this equals
  // `pending.amount` (`CASA − Σ spendable`) — the same "Chờ phân bổ" the overview
  // card shows; it shrinks as balance is added and must never go negative.
  const newSpendableTotal = useMemo(
    () =>
      jars.reduce((s, j) => s + Math.max(0, (remainingByJar.get(j.id) ?? 0) + (draft[j.id] ?? 0)), 0),
    [jars, draft, remainingByJar],
  );
  const leftToSplit = pool - newSpendableTotal;
  // Only savable once the user has actually added something: an untouched sheet
  // (nothing added) is a no-op.
  const canSubmit = poolKnown && leftToSplit >= 0 && added > 0 && !submitting;

  async function submit() {
    setError(false);
    setSubmitting(true);
    try {
      // Only send jars the user added to: new limit = hạn mức hiện có + số cộng
      // thêm. A jar left at 0 is untouched (skipped) — this sheet only tops up, so
      // it never clears a limit back to "chưa đặt".
      const patches: Record<string, { budgetLimit: number }> = {};
      for (const jar of jars) {
        const delta = draft[jar.id] ?? 0;
        if (delta <= 0) continue;
        patches[jar.id] = { budgetLimit: (jar.budgetLimit ?? 0) + delta };
      }
      await updateJars(patches);
      onClose();
    } catch {
      setError(true); // keep the draft so the user can retry
      setSubmitting(false);
    }
  }

  return (
    <Sheet title="Chia tiền vào hũ" description="Nhập số tiền cộng thêm vào mỗi hũ để chia hết phần đang chờ. Hạn mức là số dư hiển thị của hũ. Không chuyển tiền, không cần OTP." onClose={onClose}>
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
