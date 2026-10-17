"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { InsufficientData } from "@/components/states";
import type { JarEnvelopeResult } from "@/domain/engine";
import type { Jar } from "@/domain/models";
import { jarAccent } from "@/lib/category-colors";
import { formatVndCompact } from "@/lib/format";
import { askAgentToDistribute } from "@/lib/agent-distribute";
import { usePersonaCif } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { AllocationJarRow } from "./AllocationJarRow";

/**
 * "Chia ngay" bottom sheet: hand the "Chờ phân bổ" leftover into jars as **SỐ DƯ**
 * (balance) — it raises each jar's `balance`, NOT its `budgetLimit` (hạn mức).
 * A jar already "đã vượt hạn mức" keeps that verdict after being topped up (the
 * two-axis rule, journal 260920). It moves NO real money — a pure display
 * partition of the CASA balance (invariant #3).
 *
 * ADD-TO-JAR: "Còn lại để chia" opens at the residual the overview shows —
 * `CASA − Σ số dư hiện có`, i.e. exactly the "Chờ phân bổ" the "Chia ngay →" CTA
 * came from (`PendingAllocationCard`, `jarEnvelope.pending`). Every input opens at
 * 0 and is the amount to ADD to that jar, so the user HANDS OUT the leftover into
 * jars; the leftover shrinks as it is handed out.
 *
 * Hitting the save button without adding anything is a no-op — `canSubmit` requires
 * a positive total added, so an untouched sheet changes nothing.
 *
 * Guardrail: Σ (số dư mới của mọi hũ) ≤ CASA pool, i.e. tổng cộng thêm ≤ phần còn
 * lại. Persistence (plan 260923): ONE atomic `postLedger` batch — a deposit per jar
 * with a positive amount, all or nothing, never a limit change. States: saving
 * (button off, "Đang lưu…"), error (`role="alert"` with the server reason, e.g.
 * over-cap `overBy`; the WHOLE draft is kept), success (closes). Current month only
 * — callers render the sheet only when the viewed month is the current one.
 *
 * "Gợi ý cách chia từ M-You" (only with a persona and something left to split) asks the
 * agent's `/jar-distribute` how to split the WHOLE leftover and only PRE-FILLS the
 * draft — the customer still edits and saves (`lib/agent-distribute.ts`).
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
  const { postLedger, mutationError } = useJarConfig();
  const [saving, setSaving] = useState(false);
  /** This sheet's last batch was refused — only then is `mutationError` ours to show. */
  const [refused, setRefused] = useState(false);
  const { pending } = envelope;
  const cif = usePersonaCif();
  const [suggest, setSuggest] = useState<
    { status: "idle" } | { status: "loading" } | { status: "done"; text: string }
  >({ status: "idle" });
  // Every jar opens at 0 — the input is the amount to ADD to that jar's balance,
  // not its new total, so the user distributes the leftover rather than rewriting
  // each full total.
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(jars.map((j) => [j.id, 0])),
  );

  const poolKnown = pending.pool !== "unknown";
  const pool = poolKnown ? (pending.pool as number) : 0;
  // "Chờ phân bổ" (`CASA − Σ số dư hũ`), NOT `pool`: `pool` is the whole CASA balance. The
  // agent is asked to split exactly what is unallocated right now — never the CASA total.
  const unallocated = pending.amount === "unknown" ? 0 : Math.max(0, pending.amount);
  // Each jar's current running `balance` from the engine — a null (no limit) or
  // overspent jar contributes 0 spendable. BALANCE LENS: leftToSplit = CASA − Σ new
  // spendable, where adding Δ to a jar makes its spendable `max(0, balance + Δ)`.
  const balanceByJar = useMemo(
    () => new Map(envelope.jars.map((l) => [l.jarId, l.balance ?? 0])),
    [envelope.jars],
  );
  const added = useMemo(() => Object.values(draft).reduce((s, n) => s + (n || 0), 0), [draft]);
  // Live leftover as the user hands money out. At open (nothing added) this equals
  // `pending.amount` (`CASA − Σ spendable`) — the same "Chờ phân bổ" the overview
  // card shows; it shrinks as balance is added and must never go negative.
  const newSpendableTotal = useMemo(
    () =>
      jars.reduce((s, j) => s + Math.max(0, (balanceByJar.get(j.id) ?? 0) + (draft[j.id] ?? 0)), 0),
    [jars, draft, balanceByJar],
  );
  const leftToSplit = pool - newSpendableTotal;
  // Only savable once the user has actually added something: an untouched sheet
  // (nothing added) is a no-op.
  const canSubmit = poolKnown && leftToSplit >= 0 && added > 0 && !saving;

  async function askAgent() {
    if (!cif || suggest.status === "loading" || unallocated <= 0) return;
    setSuggest({ status: "loading" });
    const answer = await askAgentToDistribute({ cif, amount: unallocated, jarIds: jars.map((j) => j.id) });
    if (answer.kind === "plan") {
      // Pre-fill only: every other jar goes back to 0 so the draft is exactly the proposal.
      setDraft(Object.fromEntries(jars.map((j) => [j.id, answer.additions[j.id] ?? 0])));
      setSuggest({ status: "done", text: answer.reason });
    } else {
      setSuggest({ status: "done", text: answer.text });
    }
  }

  async function submit() {
    // Only the jars the user added to; a jar left at 0 is untouched (skipped). Each
    // deposit raises that jar's SỐ DƯ and never touches its `budgetLimit`.
    const entries = jars
      .filter((jar) => (draft[jar.id] ?? 0) > 0)
      .map((jar) => ({ jarId: jar.id, kind: "deposit" as const, amount: draft[jar.id] }));
    if (entries.length === 0) return;
    setRefused(false);
    setSaving(true);
    const ok = await postLedger(entries);
    setSaving(false);
    if (ok) onClose();
    else setRefused(true); // keep the whole draft so the user can adjust and retry
  }

  return (
    <Sheet title="Chia tiền vào hũ" description="Nhập số tiền cộng thêm vào mỗi hũ để chia hết phần đang chờ. Chỉ tăng SỐ DƯ của hũ, không đổi hạn mức. Không chuyển tiền, không cần OTP." onClose={onClose}>
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

          {cif && unallocated > 0 && (
            <div className="mb-2 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => void askAgent()}
                disabled={suggest.status === "loading" || saving}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {suggest.status === "loading" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
                {suggest.status === "loading" ? "M-You đang phân tích…" : "Gợi ý cách chia từ M-You"}
              </button>
              {suggest.status === "loading" && (
                <p role="status" className="text-xs text-muted">Có thể mất chừng 20 giây. Bạn vẫn nhập tay được trong lúc chờ.</p>
              )}
              {suggest.status === "done" && <p className="text-xs text-text">{suggest.text}</p>}
            </div>
          )}

          <div className="divide-y divide-border">
            {jars.map((jar) => (
              <AllocationJarRow
                key={jar.id}
                label={jar.label}
                accent={jarAccent(jar)}
                currentBalance={envelope.jars.find((l) => l.jarId === jar.id)?.balance ?? null}
                value={draft[jar.id] ?? 0}
                onChange={(next) => setDraft((d) => ({ ...d, [jar.id]: next }))}
              />
            ))}
          </div>

          {leftToSplit < 0 && (
            <p role="alert" className="mt-2 text-sm text-negative">
              Tổng vượt quá số dư khả dụng. Giảm bớt để tổng ≤ số dư.
            </p>
          )}
          {refused && mutationError && (
            <p role="alert" className="mt-2 text-sm text-negative">
              {mutationError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {saving ? "Đang lưu…" : "Thêm vào số dư"}
          </button>
        </div>
      )}
    </Sheet>
  );
}
