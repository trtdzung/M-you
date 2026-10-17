"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { jarIcon } from "@/components/settings/jar-visuals";
import type { RawData } from "@/domain/engine/finance-compose";
import type { Transaction } from "@/domain/models";
import {
  isValidTransferAmount,
  POOL_DONOR_ID,
  previewTransfer,
  transferCapOf,
  transferEndpoints,
  validateTransfer,
} from "@/domain/engine";
import { cn } from "@/lib/cn";
import { transferNow } from "@/lib/demo-clock";
import { formatVnd } from "@/lib/format";
import { useAutoFundWith } from "@/state/use-auto-fund";
import { useJarConfig } from "@/state/jars";
import { endpointIcon, JarTransferEndpointRow } from "./JarTransferEndpointRow";
import { JarTransferPicker, type PickerSide } from "./JarTransferPicker";
import { JarTransferAmountField } from "./JarTransferAmountField";

export interface JarTransferSummary {
  amount: number;
  fromLabel: string;
  toLabel: string;
}

const labelClass = "text-xs font-medium uppercase tracking-wide text-muted";

/**
 * "Chuyển giữa các hũ" (Tổng quan, current month): move SỐ DƯ from one jar (or
 * the "Chưa phân bổ" pool) to another. One `dieu-chinh-hu` leg via
 * `commitPersisted` — a display partition of CASA: no real money, no OTP
 * (invariant #3), never a limit change. Every number comes from the engine
 * snapshot (#1) through the shared `jar-transfer-rules`; the server re-checks
 * the leg (`rebalance-leg-guard`) because client validation is UX only.
 * Data is passed in (already loaded by the overview) — no second fetch.
 */
export function JarTransferSheet({
  initialFromId,
  transactions,
  raw,
  onClose,
  onDone,
}: {
  initialFromId: string;
  transactions: Transaction[];
  raw: RawData | null;
  onClose: () => void;
  onDone: (summary: JarTransferSummary) => void;
}) {
  const { config } = useJarConfig();
  const autoFund = useAutoFundWith({ transactions, raw });
  const postedAt = useMemo(() => transferNow().toISOString(), []);
  const ready = raw !== null;
  const snapshot = useMemo(() => (ready ? autoFund.snapshotAt(postedAt) : null), [ready, autoFund, postedAt]);
  const endpoints = useMemo(() => (snapshot ? transferEndpoints(snapshot) : []), [snapshot]);

  const [fromId, setFromId] = useState(initialFromId);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState<PickerSide | null>(null);
  const inFlight = useRef(false);
  const fromErrorId = useId();

  const jarIconOf = (id: string) => jarIcon(config.jars.find((j) => j.id === id)?.icon);
  const find = (id: string | null) => endpoints.find((e) => e.id === id) ?? null;

  const content = (() => {
    if (!snapshot) return <p className="text-sm text-muted">Đang tải số dư các hũ…</p>;
    if (endpoints.filter((e) => e.balance !== null).length < 2) {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Cần ít nhất 2 hũ có số dư để chuyển.</p>
          <button type="button" onClick={onClose} className="h-12 cursor-pointer rounded-full bg-surface-muted text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            Đóng
          </button>
        </div>
      );
    }
    if (picking) {
      return (
        <JarTransferPicker
          side={picking}
          endpoints={endpoints}
          otherId={picking === "from" ? toId : fromId}
          jarIconOf={jarIconOf}
          onBack={() => setPicking(null)}
          onPick={(id) => {
            if (picking === "from") setFromId(id);
            else setToId(id);
            setProblem(null);
            setPicking(null);
          }}
        />
      );
    }

    const from = find(fromId);
    const to = find(toId);
    const check = validateTransfer({ fromId, toId, amount }, endpoints);
    const cap = transferCapOf(endpoints, fromId);
    const overCap = amount !== null && cap !== null && amount > cap;
    const amountError =
      amount === null ? null : overCap ? `Tối đa ${formatVnd(cap)}.` : touched && !isValidTransferAmount(amount) ? "Nhập số tiền lớn hơn 0." : null;
    const fromError = !check.ok && check.field === "from" ? check.message : null;
    const preview = previewTransfer({ fromId, toId, amount }, endpoints);
    const saving = status === "saving";
    // The pool never shows a negative figure (UI convention); jars show their true balance.
    const shown = (id: string | null, v: number | null) =>
      v === null ? "Chưa có số dư" : formatVnd(id === POOL_DONOR_ID ? Math.max(0, v) : v);

    async function confirm() {
      if (inFlight.current || status !== "idle" || !check.ok || !from || !to || amount === null) return;
      inFlight.current = true;
      setProblem(null);
      setStatus("saving");
      const targetJarId = to.id === POOL_DONOR_ID ? null : to.id;
      try {
        await autoFund.commitPersisted({
          assessment: { tier: "topup", shortfall: amount, donors: [{ jarId: from.id, label: from.label, take: amount }], targetJarId, source: "mock" },
          targetJarId,
          triggerTxnId: `jar-transfer-${Date.now()}`,
          postedAt,
          origin: "manual",
        });
        onDone({ amount, fromLabel: from.label, toLabel: to.label });
      } catch {
        setProblem("Không ghi được thay đổi. Vui lòng thử lại.");
        setStatus("idle");
        inFlight.current = false;
      }
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Từ hũ</span>
          <JarTransferEndpointRow endpoint={from} Icon={from ? endpointIcon(from, jarIconOf) : null} onClick={() => setPicking("from")} showChevron ariaLabel={`Hũ chuyển: ${from?.label ?? ""} — đổi`} describedBy={fromError ? fromErrorId : undefined} />
          {fromError && <p id={fromErrorId} role="alert" className="text-xs text-negative">{fromError}</p>}
        </div>

        <button
          type="button"
          aria-label="Đảo chiều chuyển"
          disabled={toId === null || saving}
          onClick={() => {
            if (toId === null) return;
            setFromId(toId);
            setToId(fromId);
            setProblem(null);
          }}
          className="group mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <ArrowUpDown size={18} aria-hidden className="motion-safe:transition-transform motion-safe:group-active:rotate-180" />
        </button>

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Đến hũ</span>
          <JarTransferEndpointRow endpoint={to} Icon={to ? endpointIcon(to, jarIconOf) : null} placeholder="Chọn hũ nhận" onClick={() => setPicking("to")} showChevron ariaLabel={to ? `Hũ nhận: ${to.label} — đổi` : "Chọn hũ nhận"} />
        </div>

        <JarTransferAmountField
          amount={amount}
          cap={cap}
          error={amountError}
          onChange={(next) => {
            setAmount(next);
            setProblem(null);
          }}
          onBlur={() => setTouched(true)}
        />

        {from && to && (
          <dl className="flex flex-col gap-1 rounded-xl bg-surface-muted px-3 py-2 text-sm">
            {[
              { id: from.id, label: from.label, side: preview.from },
              { id: to.id, label: to.label, side: preview.to },
            ].map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3">
                <dt className="truncate text-muted">{row.label}</dt>
                <dd className="shrink-0 font-medium tabular-nums text-text">
                  {shown(row.id, row.side.before)} → {shown(row.id, row.side.after)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p className="text-xs text-muted">Chỉ chia lại số dư giữa các hũ trong tài khoản, không có tiền thật chuyển.</p>
        {problem && <p role="alert" className="text-sm text-negative">{problem}</p>}

        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!check.ok || saving}
          aria-busy={saving}
          className={cn(
            "h-12 cursor-pointer rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          )}
        >
          {saving ? "Đang chuyển…" : isValidTransferAmount(amount) ? `Chuyển ${formatVnd(amount)}` : "Chuyển"}
        </button>
      </div>
    );
  })();

  return (
    <Sheet title="Chuyển giữa các hũ" onClose={onClose}>
      {content}
    </Sheet>
  );
}
