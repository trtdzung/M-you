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

interface Row {
  key: number;
  jarId: string;
  amount: number;
}

const fieldClass =
  "min-w-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60";

/**
 * Renders a `RebalanceJarsUi` (Feature 4) — the agent's proposal to cover a jar's
 * shortfall from other jars / the unallocated pool for THIS month. Every part is
 * editable: the jar being topped up, each source (a jar, or the pool), and each
 * amount, plus adding / removing sources. Moving balance changes neither a limit
 * (`budgetLimit`) nor any real money; "Áp dụng" is the customer's confirmation,
 * after which `pfm` writes one `dieu-chinh-hu` leg per source through the same
 * store the automatic top-up uses.
 *
 * The agent's proposal only PRE-FILLS the form (its shape was checked by
 * `isRebalanceJarsUi`). Whatever the customer ends up with is checked here against
 * the engine's snapshot before anything is written: each source must exist, is not
 * the target, appears once, and can give at most its own spendable (the pool: the
 * unallocated amount). A stale proposal simply shows those limits as errors the
 * customer can fix, instead of a dead end.
 */
export function AgentRebalanceCard({ form, fullWidth = false }: { form: RebalanceJarsUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const fin = useFinancials();
  const autoFund = useAutoFundWith({ transactions: fin.transactions, raw: fin.raw });
  const key = proposalKey(persona.cif, form);
  const postedAt = useMemo(() => transferNow().toISOString(), []);
  const [status, setStatus] = useState<"idle" | "saving" | "done">(() => (wasApplied(key) ? "done" : "idle"));
  const [problem, setProblem] = useState<string | null>(null);
  const [targetId, setTargetId] = useState(form.target_jar_id);
  const [rows, setRows] = useState<Row[]>(() => form.moves.map((m, i) => ({ key: i, jarId: m.from_jar_id, amount: m.amount })));
  const [nextKey, setNextKey] = useState(form.moves.length);

  const wrap = cn("shadow-card flex flex-col gap-2 rounded-2xl bg-surface p-3.5", fullWidth ? "w-full" : "mt-2 w-[85%]");

  const ready = fin.financials !== null;
  const snapshot = useMemo(() => (ready ? autoFund.snapshotAt(postedAt) : null), [ready, autoFund, postedAt]);

  const done = status === "done";

  if (!snapshot) {
    return done ? null : (
      <div className={wrap}>
        <p className="text-xs text-muted">Đang tải số dư các hũ…</p>
      </div>
    );
  }

  const jars = snapshot.spendables;
  const pool = Math.max(
    0,
    computeUnallocatedPool({
      casaBalance: snapshot.casaBalance,
      spendableTotal: jars.reduce((sum, j) => sum + (j.spendable ?? 0), 0),
    }).amount,
  );
  const target = jars.find((j) => j.id === targetId);
  if (!target && !done) {
    return (
      <div className={wrap}>
        <p className="text-[11px] font-semibold text-muted">Đề xuất chia tiền giữa các hũ</p>
        <p role="alert" className="text-xs text-negative">Không tìm thấy hũ cần bù. Hỏi lại M-Your để có đề xuất mới.</p>
      </div>
    );
  }

  const targetBalance = target?.spendable ?? null;
  const remaining = snapshot.lines.find((l) => l.huId === targetId)?.remaining ?? null;
  // A jar that is out of money has an exactly-known gap; otherwise it is the amount
  // the agent worked out for a spend only the customer knows about.
  const need = targetId === form.target_jar_id && remaining !== null && remaining < 0 ? -remaining : form.shortfall;

  const labelOf = (id: string) => (id === POOL_DONOR_ID ? POOL_DONOR_LABEL : jars.find((j) => j.id === id)?.label ?? id);
  const capOf = (id: string): number | null => (id === POOL_DONOR_ID ? pool : jars.find((j) => j.id === id)?.spendable ?? null);
  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);

  const rowError = (row: Row): string | null => {
    if (row.jarId === targetId) return "Không lấy từ chính hũ cần bù.";
    if (rows.some((r) => r.key !== row.key && r.jarId === row.jarId)) return "Nguồn này đã có ở dòng khác.";
    const cap = capOf(row.jarId);
    if (cap === null) return "Hũ này chưa đặt hạn mức nên không cho tiền được.";
    if (!Number.isFinite(row.amount) || row.amount <= 0) return "Nhập số tiền lớn hơn 0.";
    if (row.amount > cap) return `Tối đa ${formatVnd(cap)}.`;
    return null;
  };
  const formProblem =
    targetBalance === null
      ? "Hũ cần bù chưa đặt hạn mức."
      : rows.length === 0
        ? "Thêm ít nhất một nguồn lấy tiền."
        : rows.some((r) => rowError(r) !== null)
          ? "Sửa các dòng đang báo lỗi."
          : null;

  const usedIds = new Set(rows.map((r) => r.jarId));
  const freeSources = [
    ...(usedIds.has(POOL_DONOR_ID) ? [] : [POOL_DONOR_ID]),
    ...jars.filter((j) => j.id !== targetId && j.spendable !== null && !usedIds.has(j.id)).map((j) => j.id),
  ];

  function edit(update: () => void) {
    setProblem(null);
    update();
  }

  function changeTarget(id: string) {
    edit(() => {
      setTargetId(id);
      setRows((prev) => prev.filter((r) => r.jarId !== id));
    });
  }

  function addRow() {
    const jarId = freeSources[0];
    if (!jarId) return;
    const cap = capOf(jarId) ?? 0;
    edit(() => {
      setRows((prev) => [...prev, { key: nextKey, jarId, amount: Math.max(0, Math.min(cap, need - total)) }]);
      setNextKey((k) => k + 1);
    });
  }

  async function confirm() {
    if (formProblem || status !== "idle") return;
    setProblem(null);
    setStatus("saving");
    const assessment: FundingAssessment = {
      tier: "topup",
      shortfall: total,
      donors: rows.map((r) => ({ jarId: r.jarId, label: labelOf(r.jarId), take: r.amount })),
      targetJarId: targetId,
      source: "mock",
    };
    try {
      await autoFund.commitPersisted({
        assessment,
        targetJarId: targetId,
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

  return (
    <div className={wrap}>
      <p className="text-[11px] font-semibold text-muted">Đề xuất chia tiền giữa các hũ</p>

      <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        Hũ cần thêm tiền
        <select value={targetId} onChange={(e) => changeTarget(e.target.value)} disabled={done} className={cn(fieldClass, "text-sm normal-case")}>
          {jars.filter((j) => j.spendable !== null).map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted">
        {targetBalance !== null && <>Số dư hiện tại: {formatVnd(targetBalance)} · </>}
        cần thêm khoảng {formatVnd(need)}
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Lấy tiền từ</span>
        {rows.map((row) => {
          const err = rowError(row);
          return (
            <div key={row.key} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <select
                  value={row.jarId}
                  onChange={(e) => edit(() => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, jarId: e.target.value } : r))))}
                  disabled={done}
                  aria-label="Nguồn lấy tiền"
                  className={cn(fieldClass, "flex-1")}
                >
                  {[row.jarId, ...freeSources].map((id) => (
                    <option key={id} value={id}>
                      {labelOf(id)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={row.amount}
                  onChange={(e) => edit(() => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, amount: Number(e.target.value) } : r))))}
                  disabled={done}
                  aria-label="Số tiền"
                  className={cn(fieldClass, "w-28 font-semibold tabular-nums")}
                />
                {!done && (
                  <button
                    type="button"
                    onClick={() => edit(() => setRows((prev) => prev.filter((r) => r.key !== row.key)))}
                    aria-label="Bỏ nguồn này"
                    className="shrink-0 px-1 text-sm text-muted hover:text-negative"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className={cn("text-[11px]", err ? "text-negative" : "text-muted")}>
                {err ?? `Tối đa ${formatVnd(capOf(row.jarId) ?? 0)}`}
              </p>
            </div>
          );
        })}
        {!done && freeSources.length > 0 && (
          <button type="button" onClick={addRow} className="self-start text-[11px] font-semibold text-primary hover:underline">
            + Thêm nguồn
          </button>
        )}
      </div>

      <p className="text-xs font-semibold text-text">
        Tổng lấy: {formatVnd(total)}
        {total !== need && <span className="font-normal text-muted"> (đề xuất {formatVnd(need)})</span>}
      </p>

      <p className="text-xs text-muted">{form.reason}</p>
      <p className="text-[11px] text-muted">Chỉ điều chỉnh số dư trong tháng này — không đổi hạn mức, không chuyển tiền thật.</p>
      {problem && <p role="alert" className="text-xs text-negative">{problem}</p>}

      <button
        type="button"
        onClick={confirm}
        disabled={done || status === "saving" || formProblem !== null}
        className="mt-1 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-40"
      >
        {done ? "Đã áp dụng" : status === "saving" ? "Đang áp dụng…" : formProblem ?? "Áp dụng"}
      </button>
    </div>
  );
}
