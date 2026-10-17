"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { markApplied, proposalKey, wasApplied } from "@/lib/agent-applied";
import { transferNow } from "@/lib/demo-clock";
import { usePersona } from "@/providers/context";
import { useFinancials } from "@/state/useFinancials";
import { useAutoFundWith } from "@/state/use-auto-fund";
import { isValidTransferAmount, transferCapOf, transferEndpoints } from "@/domain/engine";
import type { RebalanceJarsUi } from "@/lib/agent-api";

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
 * Renders a `RebalanceJarsUi` (contract 2026-09-24) — the agent's proposal to move
 * SỐ DƯ from ONE source jar into one or more other jars. It moves the running
 * balance (which carries over months), never HẠN MỨC, and no real money. Every part
 * is editable: the source jar, each receiving jar and amount, plus adding / removing
 * receivers. "Áp dụng" is the customer's confirmation, after which `pfm` writes one
 * `dieu-chinh-hu` leg per receiver (`commitFanOut`, invariant #3 — a display
 * partition, no OTP, no transfer).
 *
 * The agent's proposal only PRE-FILLS the form (its shape was checked by
 * `isRebalanceJarsUi`). What the customer ends up with is checked here against the
 * engine's snapshot before anything is written: the source can give at most its
 * `spendable` (`max(0, balance)`) IN TOTAL, a receiver is a different jar, appears
 * once and already has a balance (the server refuses a leg into a jar with none —
 * `rebalance-leg-guard`), and a source with no balance yet cannot give at all. A
 * stale proposal simply shows those limits as errors the customer can fix, instead
 * of a dead end.
 */
export function AgentRebalanceCard({ form, fullWidth = false }: { form: RebalanceJarsUi; fullWidth?: boolean }) {
  const { persona } = usePersona();
  const fin = useFinancials();
  const autoFund = useAutoFundWith({ transactions: fin.transactions, raw: fin.raw });
  const key = proposalKey(persona.cif, form);
  const postedAt = useMemo(() => transferNow().toISOString(), []);
  const [status, setStatus] = useState<"idle" | "saving" | "done">(() => (wasApplied(key) ? "done" : "idle"));
  const [problem, setProblem] = useState<string | null>(null);
  const [fromId, setFromId] = useState(form.from_jar_id);
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
  const endpoints = transferEndpoints(snapshot);
  const source = jars.find((j) => j.id === fromId);
  if (!source && !done) {
    return (
      <div className={wrap}>
        <p className="text-[11px] font-semibold text-muted">Đề xuất chuyển số dư giữa các hũ</p>
        <p role="alert" className="text-xs text-negative">Không tìm thấy hũ cho tiền. Hỏi lại M-You để có đề xuất mới.</p>
      </div>
    );
  }

  const labelOf = (id: string) => jars.find((j) => j.id === id)?.label ?? id;
  // What the source can give in total; `null` = it has no balance yet (cannot give).
  const cap = transferCapOf(endpoints, fromId);
  const balanceOf = (id: string): number | null => endpoints.find((e) => e.id === id)?.balance ?? null;
  // A row the customer added but left completely blank is ignored, not an error.
  const active = rows.filter((r) => r.jarId !== "" || r.amount !== null);
  const total = active.reduce((sum, r) => sum + (r.amount !== null && Number.isFinite(r.amount) ? r.amount : 0), 0);

  const rowError = (row: Row): string | null => {
    if (row.jarId === "") return "Chọn hũ nhận.";
    if (row.jarId === fromId) return "Không chuyển vào chính hũ cho tiền.";
    if (rows.some((r) => r.key !== row.key && r.jarId === row.jarId)) return "Hũ này đã có ở dòng khác.";
    if (balanceOf(row.jarId) === null) return "Hũ này chưa có số dư — nạp tiền vào hũ trước khi nhận chuyển.";
    if (!isValidTransferAmount(row.amount)) return "Nhập số tiền lớn hơn 0.";
    return null;
  };
  const formProblem =
    cap === null
      ? "Hũ cho tiền chưa có số dư."
      : active.length === 0
        ? "Thêm ít nhất một hũ nhận."
        : active.some((r) => rowError(r) !== null)
          ? "Sửa các dòng đang báo lỗi."
          : total > cap
            ? `Tổng vượt quá ${formatVnd(cap)}.`
            : null;

  const usedIds = new Set(rows.map((r) => r.jarId));
  const freeReceivers = jars.filter((j) => j.id !== fromId && !usedIds.has(j.id)).map((j) => j.id);

  function edit(update: () => void) {
    setProblem(null);
    update();
  }

  function changeSource(id: string) {
    edit(() => {
      setFromId(id);
      setRows((prev) => prev.filter((r) => r.jarId !== id));
    });
  }

  function addRow() {
    if (freeReceivers.length === 0) return;
    edit(() => {
      setRows((prev) => [...prev, { key: nextKey, jarId: "", amount: null }]);
      setNextKey((k) => k + 1);
    });
  }

  async function confirm() {
    if (formProblem || status !== "idle") return;
    setProblem(null);
    setStatus("saving");
    try {
      await autoFund.commitFanOut({
        fromJarId: fromId,
        moves: active.map((r) => ({ toJarId: r.jarId, amount: r.amount as number })),
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
      <p className="text-[11px] font-semibold text-muted">Đề xuất chuyển số dư giữa các hũ</p>

      <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        Lấy tiền từ hũ
        <select value={fromId} onChange={(e) => changeSource(e.target.value)} disabled={done} className={cn(fieldClass, "text-sm normal-case")}>
          {jars.filter((j) => j.spendable !== null).map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted">
        {cap === null ? "Chưa có số dư" : `Có thể chuyển tối đa ${formatVnd(cap)}`}
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Chuyển sang</span>
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
                  {[...(row.jarId ? [row.jarId] : []), ...freeReceivers].map((id) => (
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
        {!done && freeReceivers.length > 0 && (
          <button type="button" onClick={addRow} className="self-start text-[11px] font-semibold text-primary hover:underline">
            + Thêm hũ nhận
          </button>
        )}
      </div>

      <p className="text-xs font-semibold text-text">
        Tổng chuyển: {formatVnd(total)}
        {cap !== null && <span className="font-normal text-muted"> / tối đa {formatVnd(cap)}</span>}
      </p>

      <p className="text-[11px] text-muted">Chỉ chuyển số dư giữa các hũ — không đổi hạn mức, không chuyển tiền thật, không cần OTP.</p>
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
