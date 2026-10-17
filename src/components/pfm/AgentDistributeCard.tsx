"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { markApplied, proposalKey, wasApplied } from "@/lib/agent-applied";
import { transferNow } from "@/lib/demo-clock";
import { usePersona } from "@/providers/context";
import { useFinancials } from "@/state/useFinancials";
import { useAutoFundWith } from "@/state/use-auto-fund";
import { useJarConfig } from "@/state/jars";
import { isValidTransferAmount, POOL_DONOR_ID, transferCapOf, transferEndpoints } from "@/domain/engine";
import type { DistributeAmountUi } from "@/lib/agent-api";

interface Row {
  key: number;
  /** `""` = a row added but not filled in yet. */
  jarId: string;
  /** `null` = not typed yet. */
  amount: number | null;
}

const fieldClass =
  "min-w-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60";

/**
 * Renders a `DistributeAmountUi` (contract 2026-09-24) — the agent's proposal to hand
 * out money from "Chưa phân bổ" into one or more jars as SỐ DƯ. Never HẠN MỨC, and no
 * real money (invariant #3). Every jar and amount is editable, and receivers can be
 * added / removed. "Áp dụng" is the customer's confirmation: ONE atomic `postLedger`
 * batch of deposits — the same single door the "Chia ngay" sheet writes through — so
 * the server's own cap (Σ spendable ≤ CASA) still applies and a refusal changes nothing.
 *
 * The proposal only PRE-FILLS the form (shape checked by `isDistributeAmountUi`).
 * What the customer ends up with is checked here against the engine's snapshot: each
 * receiver is a real jar, appears once, amount is a positive whole number, and the
 * total is at most the unallocated amount. Unlike a jar-to-jar move, a jar with no
 * balance yet CAN receive — the deposit is its first balance.
 */
export function AgentDistributeCard({ form, fullWidth = false }: { form: DistributeAmountUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const fin = useFinancials();
  const autoFund = useAutoFundWith({ transactions: fin.transactions, raw: fin.raw });
  const { postLedger, mutationError } = useJarConfig();
  const key = proposalKey(persona.cif, form);
  const postedAt = useMemo(() => transferNow().toISOString(), []);
  const [status, setStatus] = useState<"idle" | "saving" | "done">(() => (wasApplied(key) ? "done" : "idle"));
  const [refused, setRefused] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => form.allocations.map((a, i) => ({ key: i, jarId: a.to_jar_id, amount: a.amount })));
  const [nextKey, setNextKey] = useState(form.allocations.length);

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
  const pool = transferCapOf(transferEndpoints(snapshot), POOL_DONOR_ID) ?? 0;
  const labelOf = (id: string) => jars.find((j) => j.id === id)?.label ?? id;
  // A row the customer added but left completely blank is ignored, not an error.
  const active = rows.filter((r) => r.jarId !== "" || r.amount !== null);
  const total = active.reduce((sum, r) => sum + (r.amount !== null && Number.isFinite(r.amount) ? r.amount : 0), 0);

  const rowError = (row: Row): string | null => {
    if (row.jarId === "") return "Chọn hũ nhận.";
    if (!jars.some((j) => j.id === row.jarId)) return "Không tìm thấy hũ này.";
    if (rows.some((r) => r.key !== row.key && r.jarId === row.jarId)) return "Hũ này đã có ở dòng khác.";
    if (!isValidTransferAmount(row.amount)) return "Nhập số tiền lớn hơn 0.";
    return null;
  };
  const formProblem =
    pool <= 0
      ? "Không còn tiền chưa phân bổ."
      : active.length === 0
        ? "Thêm ít nhất một hũ nhận."
        : active.some((r) => rowError(r) !== null)
          ? "Sửa các dòng đang báo lỗi."
          : total > pool
            ? `Tổng vượt quá ${formatVnd(pool)}.`
            : null;

  const usedIds = new Set(rows.map((r) => r.jarId));
  const freeJars = jars.filter((j) => !usedIds.has(j.id)).map((j) => j.id);

  function edit(update: () => void) {
    setRefused(false);
    update();
  }

  function addRow() {
    if (freeJars.length === 0) return;
    edit(() => {
      setRows((prev) => [...prev, { key: nextKey, jarId: "", amount: null }]);
      setNextKey((k) => k + 1);
    });
  }

  async function confirm() {
    if (formProblem || status !== "idle") return;
    setRefused(false);
    setStatus("saving");
    const ok = await postLedger(active.map((r) => ({ jarId: r.jarId, kind: "deposit" as const, amount: r.amount as number })));
    if (ok) {
      markApplied(key);
      setStatus("done");
    } else {
      setRefused(true);
      setStatus("idle");
    }
  }

  return (
    <div className={wrap}>
      <p className="text-[11px] font-semibold text-muted">Đề xuất chia tiền chưa phân bổ vào hũ</p>
      <p className="text-xs text-muted">Chưa phân bổ hiện có {formatVnd(pool)}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Chia vào</span>
        {rows.map((row) => {
          const err = rowError(row);
          return (
            <div key={row.key} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <select
                  value={row.jarId}
                  onChange={(e) => edit(() => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, jarId: e.target.value } : r))))}
                  disabled={done}
                  aria-label="Hũ nhận"
                  className={cn(fieldClass, "flex-1")}
                >
                  {row.jarId === "" && <option value="">Chọn hũ</option>}
                  {[...(row.jarId ? [row.jarId] : []), ...freeJars].map((id) => (
                    <option key={id} value={id}>
                      {labelOf(id)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={row.amount ?? ""}
                  placeholder="Số tiền"
                  onChange={(e) => edit(() => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, amount: e.target.value === "" ? null : Number(e.target.value) } : r))))}
                  disabled={done}
                  aria-label="Số tiền"
                  className={cn(fieldClass, "w-28 font-semibold tabular-nums")}
                />
                {!done && (
                  <button
                    type="button"
                    onClick={() => edit(() => setRows((prev) => prev.filter((r) => r.key !== row.key)))}
                    aria-label="Bỏ hũ nhận này"
                    className="shrink-0 px-1 text-sm text-muted hover:text-negative"
                  >
                    ✕
                  </button>
                )}
              </div>
              {err && <p className="text-[11px] text-negative">{err}</p>}
            </div>
          );
        })}
        {!done && freeJars.length > 0 && (
          <button type="button" onClick={addRow} className="self-start text-[11px] font-semibold text-primary hover:underline">
            + Thêm hũ nhận
          </button>
        )}
      </div>

      <p className="text-xs font-semibold text-text">
        Tổng chia: {formatVnd(total)}
        <span className="font-normal text-muted"> / còn {formatVnd(pool)}</span>
      </p>

      <p className="text-[11px] text-muted">Chỉ cộng vào số dư của hũ — không đổi hạn mức, không chuyển tiền thật, không cần OTP.</p>
      {refused && mutationError && <p role="alert" className="text-xs text-negative">{mutationError}</p>}

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
