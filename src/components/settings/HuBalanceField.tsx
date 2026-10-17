"use client";

import { useState } from "react";
import type { Jar } from "@/domain/models";
import { Money } from "@/components/primitives";
import { useJarConfig } from "@/state/jars";
import { allocatableFromPool, type CurrentJarFunds } from "@/state/use-current-jar-funds";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { parseVndInput } from "./parse-vnd-input";

const btn =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-[13px] font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

/**
 * "Số dư" of one jar (plan 260923) — the running balance, separate from the
 * monthly hạn mức above it. Deposit ("Nạp vào hũ") takes money from "Chờ phân bổ";
 * withdraw ("Rút về Chờ phân bổ") hands it back. Each is a 1-entry batch through
 * `postLedger` — a display partition of CASA, never a transfer (invariant #3).
 *
 * States: loading (skeleton, buttons off) · error (funds failed to load) · empty
 * (balance `null` → "Hũ chưa có số dư", withdraw hidden) · insufficient (pool
 * unknown → deposit off with a reason). Client pre-checks mirror the server
 * (deposit ≤ pool, withdraw ≤ max(0, balance)); a server refusal shows in the
 * editor's `JarMutationErrorNotice` with the exact `maxWithdraw` / `overBy`.
 */
export function HuBalanceField({ jar, funds }: { jar: Jar; funds: CurrentJarFunds }) {
  const { postLedger } = useJarConfig();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = funds.status === "ready";
  const balance = ready ? funds.balanceOf(jar.id) : null;
  const available = ready ? allocatableFromPool(funds.pool) : null;
  const parsed = parseVndInput(draft);

  async function submit(kind: "deposit" | "withdraw") {
    if (parsed.kind !== "ok" || parsed.value <= 0) {
      setError(parsed.kind === "error" ? parsed.message : "Nhập số tiền lớn hơn 0.");
      return;
    }
    const amount = parsed.value;
    if (kind === "deposit" && available !== null && amount > available) {
      setError(`Chỉ còn ${formatVnd(available)} chờ phân bổ.`);
      return;
    }
    if (kind === "withdraw" && amount > Math.max(0, balance ?? 0)) {
      setError(`Chỉ rút tối đa ${formatVnd(Math.max(0, balance ?? 0))}.`);
      return;
    }
    setError(null);
    setSaving(true);
    const ok = await postLedger([{ jarId: jar.id, kind, amount }]);
    setSaving(false);
    if (ok) setDraft("");
  }

  if (funds.status === "loading") {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Đang tải số dư hũ">
        <span className="text-sm font-medium text-text">Số dư</span>
        <div className="h-11 animate-pulse rounded-row bg-surface-muted" />
      </div>
    );
  }
  if (funds.status === "error") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text">Số dư</span>
        <p role="alert" className="text-xs text-negative">Không tải được số dư hũ. Vui lòng thử lại sau.</p>
      </div>
    );
  }

  const busy = saving;
  const depositBlocked = available === null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text">Số dư</span>
        {balance === null ? (
          <span className="text-xs text-muted">Hũ chưa có số dư — nạp để bắt đầu</span>
        ) : (
          <Money amount={balance} className={cn("text-sm font-semibold", balance < 0 ? "text-negative" : "text-text")} />
        )}
      </div>
      <input
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        placeholder="Số tiền"
        aria-label="Số tiền nạp/rút"
        aria-invalid={error != null}
        disabled={busy}
        className="min-h-11 rounded-row border border-border bg-surface px-3 text-right text-sm font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => void submit("deposit")} disabled={busy || depositBlocked} className={cn(btn, "bg-primary text-primary-fg")}>
          {busy ? "Đang lưu…" : "Nạp vào hũ"}
        </button>
        {balance !== null && (
          <button type="button" onClick={() => void submit("withdraw")} disabled={busy} className={cn(btn, "border border-border bg-surface text-text")}>
            Rút về Chờ phân bổ
          </button>
        )}
      </div>
      <span className={cn("text-xs", error ? "text-negative" : "text-muted")} role={error ? "alert" : undefined}>
        {error ??
          (depositBlocked
            ? "Chưa có số dư tài khoản để nạp vào hũ."
            : `Chờ phân bổ: ${formatVnd(available)} · Không chuyển tiền, không cần OTP.`)}
      </span>
    </div>
  );
}
