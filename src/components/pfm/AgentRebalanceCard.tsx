"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { markApplied, proposalKey, wasApplied } from "@/lib/agent-applied";
import { transferNow } from "@/lib/demo-clock";
import { usePersona } from "@/providers/context";
import { useFinancials } from "@/state/useFinancials";
import { useAutoFundWith } from "@/state/use-auto-fund";
import { computeUnallocatedPool, POOL_DONOR_ID, POOL_DONOR_LABEL, type FundingAssessment } from "@/domain/engine";
import type { RebalanceJarsUi } from "@/lib/agent-api";

type Check =
  | { ok: true; targetLabel: string; targetBalance: number; moves: { jarId: string; label: string; amount: number }[] }
  | { ok: false; reason: string };

/**
 * Renders a `RebalanceJarsUi` (Feature 4) — the agent's proposal to cover a jar's
 * shortfall from other jars / the unallocated pool for THIS month. Moving balance
 * changes neither a limit (`budgetLimit`) nor any real money; "Áp dụng" is the
 * customer's confirmation, after which `pfm` writes one `dieu-chinh-hu` leg per
 * source through the same store the automatic top-up uses.
 *
 * The agent's numbers are never trusted: the shape was checked by
 * `isRebalanceJarsUi`, and the caps that need real balances are checked HERE
 * against the engine's snapshot (contract "quy tắc cứng" 3–4) — every source must
 * exist and can give at most its own spendable (the pool: the unallocated
 * amount). A proposal that no longer fits (balances moved, or it was already
 * applied) is shown as stale with no button.
 */
export function AgentRebalanceCard({ form, fullWidth = false }: { form: RebalanceJarsUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const fin = useFinancials();
  const autoFund = useAutoFundWith({ transactions: fin.transactions, raw: fin.raw });
  const key = proposalKey(persona.cif, form);
  const postedAt = useMemo(() => transferNow().toISOString(), []);
  const [status, setStatus] = useState<"idle" | "saving" | "done">(() => (wasApplied(key) ? "done" : "idle"));
  const [problem, setProblem] = useState<string | null>(null);

  const wrap = cn("shadow-card flex flex-col gap-2 rounded-2xl bg-surface p-3.5", fullWidth ? "w-full" : "mt-2 w-[85%]");

  const ready = fin.financials !== null;
  const snapshot = useMemo(() => (ready ? autoFund.snapshotAt(postedAt) : null), [ready, autoFund, postedAt]);

  const check = useMemo<Check | null>(() => {
    if (!snapshot) return null;
    const jars = snapshot.spendables;
    const target = jars.find((j) => j.id === form.target_jar_id);
    if (!target) return { ok: false, reason: "Không tìm thấy hũ cần bù." };
    if (target.spendable === null) return { ok: false, reason: "Hũ cần bù chưa đặt hạn mức." };

    // A jar that is out of money has an exactly-known gap; otherwise the agent is
    // covering a spend the customer plans, which only they know.
    const remaining = snapshot.lines.find((l) => l.huId === target.id)?.remaining ?? null;
    if (remaining !== null && remaining < 0 && Math.abs(-remaining - form.shortfall) >= 0.5) {
      return { ok: false, reason: `Số thiếu đã thay đổi, hiện hũ đang thiếu ${formatVnd(-remaining)}.` };
    }

    const pool = Math.max(
      0,
      computeUnallocatedPool({
        casaBalance: snapshot.casaBalance,
        spendableTotal: jars.reduce((sum, j) => sum + (j.spendable ?? 0), 0),
      }).amount,
    );
    const moves: { jarId: string; label: string; amount: number }[] = [];
    for (const move of form.moves) {
      if (move.from_jar_id === POOL_DONOR_ID) {
        if (move.amount > pool) return { ok: false, reason: `Tiền chưa phân bổ chỉ còn ${formatVnd(pool)}.` };
        moves.push({ jarId: POOL_DONOR_ID, label: POOL_DONOR_LABEL, amount: move.amount });
        continue;
      }
      const donor = jars.find((j) => j.id === move.from_jar_id);
      if (!donor) return { ok: false, reason: "Một hũ nguồn không còn tồn tại." };
      if (donor.spendable === null) return { ok: false, reason: `Hũ ${donor.label} chưa đặt hạn mức.` };
      if (move.amount > donor.spendable) return { ok: false, reason: `Hũ ${donor.label} chỉ còn ${formatVnd(donor.spendable)}.` };
      moves.push({ jarId: donor.id, label: donor.label, amount: move.amount });
    }
    return { ok: true, targetLabel: target.label, targetBalance: target.spendable, moves };
  }, [snapshot, form]);

  async function confirm() {
    if (!check?.ok || status !== "idle") return;
    setProblem(null);
    setStatus("saving");
    const assessment: FundingAssessment = {
      tier: "topup",
      shortfall: form.shortfall,
      donors: check.moves.map((m) => ({ jarId: m.jarId, label: m.label, take: m.amount })),
      targetJarId: form.target_jar_id,
      source: "mock",
    };
    try {
      await autoFund.commitPersisted({
        assessment,
        targetJarId: form.target_jar_id,
        triggerTxnId: `agent-${Date.now()}`,
        postedAt,
        origin: "manual",
      });
      markApplied(key);
      setStatus("done");
    } catch {
      setProblem("Không ghi được thay đổi. Vui lòng thử lại.");
      setStatus("idle");
    }
  }

  const done = status === "done";

  if (!done && check === null) {
    return (
      <div className={wrap}>
        <p className="text-xs text-muted">Đang tải số dư các hũ…</p>
      </div>
    );
  }

  if (!done && check && !check.ok) {
    return (
      <div className={wrap}>
        <p className="text-[11px] font-semibold text-muted">Đề xuất chia tiền giữa các hũ</p>
        <p role="alert" className="text-xs text-negative">
          Đề xuất này không còn khớp số liệu hiện tại. {check.reason} Hỏi lại M-Your để có đề xuất mới.
        </p>
      </div>
    );
  }

  const moves = check?.ok
    ? check.moves
    : form.moves.map((m) => ({ jarId: m.from_jar_id, label: m.from_jar_id === POOL_DONOR_ID ? POOL_DONOR_LABEL : m.from_jar_id, amount: m.amount }));

  return (
    <div className={wrap}>
      <p className="text-[11px] font-semibold text-muted">Đề xuất chia tiền giữa các hũ</p>
      <p className="text-sm font-semibold text-text">
        {check?.ok ? check.targetLabel : "Hũ cần bù"} · thiếu {formatVnd(form.shortfall)}
      </p>
      {check?.ok && <p className="text-xs text-muted">Số dư hiện tại: {formatVnd(check.targetBalance)}</p>}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {moves.map((m) => (
          <li key={m.jarId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm">
            <span className="min-w-0 truncate text-text">Lấy từ {m.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-text">{formatVnd(m.amount)}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted">{form.reason}</p>
      <p className="text-[11px] text-muted">Chỉ điều chỉnh số dư trong tháng này — không đổi hạn mức, không chuyển tiền thật.</p>
      {problem && <p role="alert" className="text-xs text-negative">{problem}</p>}

      <button
        type="button"
        onClick={confirm}
        disabled={done || status === "saving"}
        className="mt-1 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-40"
      >
        {done ? "Đã áp dụng" : status === "saving" ? "Đang áp dụng…" : "Áp dụng"}
      </button>
    </div>
  );
}
