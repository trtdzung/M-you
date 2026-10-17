"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { isJarAmount } from "@/domain/jar-rules";
import { useJarConfig } from "@/state/jars";
import { allocatableFromPool, type CurrentJarFunds } from "@/state/use-current-jar-funds";
import { formatVnd } from "@/lib/format";
import { parseVndInput } from "./parse-vnd-input";

const inputClass =
  "min-h-11 rounded-row border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

/** A typed (non-blank) VND field: unparseable or oversized input is an error. */
function typedVnd(raw: string): { value: number } | { error: string } {
  const parsed = parseVndInput(raw);
  if (parsed.kind === "empty") return { error: "Nhập số tiền." };
  if (parsed.kind === "error") return { error: parsed.message };
  if (!isJarAmount(parsed.value)) return { error: "Số tiền quá lớn" };
  return { value: parsed.value };
}

/**
 * "Thêm hũ" (plan 260923 D2): a jar is created ONLY once its name is set and any
 * HẠN MỨC (monthly plan) / SỐ DƯ BAN ĐẦU (opening balance) typed are valid — one
 * POST, no empty "Hũ mới" persisted first. Both are OPTIONAL to fill in: a jar with
 * nothing to plan (e.g. "Tiết kiệm") is created with the limit left blank
 * (= "chưa đặt", stored null — never a fake 0) and an opening balance of 0. A
 * balance > 0 must fit "Chờ phân bổ" (the server re-checks: 422 `overBy`). With the
 * pool unknown/loading only a 0 balance can be created. No money moves, no OTP
 * (invariant #3).
 */
export function HuCreateSheet({
  funds,
  onCreated,
  onClose,
}: {
  funds: CurrentJarFunds;
  /** The new jar's id — the tab opens its editor to pick categories. */
  onCreated: (jarId: string) => void;
  onClose: () => void;
}) {
  const { addJar, mutationError } = useJarConfig();
  const [name, setName] = useState("");
  const [limitRaw, setLimitRaw] = useState("");
  const [balanceRaw, setBalanceRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** This sheet's last write was refused — only then is `mutationError` ours to show. */
  const [refused, setRefused] = useState(false);

  const available = funds.status === "ready" ? allocatableFromPool(funds.pool) : null;
  const poolHint =
    funds.status === "loading"
      ? "Đang tải số tiền chờ phân bổ…"
      : available === null
        ? "Chưa có số dư tài khoản — chỉ tạo được hũ với số dư 0."
        : `Chờ phân bổ: ${formatVnd(available)}`;

  function validate(): { label: string; limit: number | undefined; balance: number } | string {
    const label = name.trim();
    if (!label) return "Nhập tên hũ.";
    // Blank limit = "chưa đặt" (undefined → stored null); blank balance = an explicit 0.
    const limit = limitRaw.trim() === "" ? { value: undefined } : typedVnd(limitRaw);
    if ("error" in limit) return `Hạn mức: ${limit.error}`;
    const balance = balanceRaw.trim() === "" ? { value: 0 } : typedVnd(balanceRaw);
    if ("error" in balance) return `Số dư: ${balance.error}`;
    if (balance.value > 0 && available === null) return poolHint;
    if (available !== null && balance.value > available) {
      return `Số dư ban đầu vượt số tiền chờ phân bổ (còn ${formatVnd(available)}).`;
    }
    return { label, limit: limit.value, balance: balance.value };
  }

  async function submit() {
    const valid = validate();
    if (typeof valid === "string") {
      setError(valid);
      return;
    }
    setError(null);
    setRefused(false);
    setSaving(true);
    const id = `jar-${Date.now()}`;
    const ok = await addJar(
      { id, label: valid.label, categoryIds: [], ...(valid.limit !== undefined ? { budgetLimit: valid.limit } : {}) },
      valid.balance,
    );
    setSaving(false);
    if (ok) onCreated(id);
    else setRefused(true);
  }

  const shownError = error ?? (refused ? mutationError : null);
  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setError(null);
  };

  return (
    <Sheet title="Thêm hũ" description="Hạn mức chi mỗi tháng và số dư ban đầu có thể để trống (hạn mức chưa đặt, số dư 0)." onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Tên hũ</span>
          <input value={name} onChange={edit(setName)} aria-label="Tên hũ mới" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Hạn mức chi mỗi tháng</span>
          <input value={limitRaw} onChange={edit(setLimitRaw)} inputMode="numeric" placeholder="Để trống nếu chưa đặt (vd 3.000.000)" aria-label="Hạn mức chi mỗi tháng" className={`${inputClass} text-right`} />
          <span className="text-xs text-muted">Kế hoạch chi, đặt lại mỗi tháng — không phải tiền trong hũ. Để trống nếu hũ không cần (vd Tiết kiệm).</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Số dư ban đầu</span>
          <input value={balanceRaw} onChange={edit(setBalanceRaw)} inputMode="numeric" placeholder="0" aria-label="Số dư ban đầu" className={`${inputClass} text-right`} />
          <span className="text-xs text-muted">{poolHint} · Không chuyển tiền, không cần OTP.</span>
        </label>

        {shownError && (
          <p role="alert" className="text-sm text-negative">
            {shownError}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {saving ? "Đang lưu…" : "Tạo hũ"}
        </button>
      </div>
    </Sheet>
  );
}
