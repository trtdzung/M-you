"use client";

import { useState } from "react";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { paramNumber, paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { AmountCard } from "../../shared/AmountCard";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { card, primaryButton, sectionTitle, warningBox } from "../../shared/styles";
import { canTransact, GoalNotFound, useGoalContext } from "./common";

/** Nạp tiền vào tài khoản mục tiêu. */
export function DepositFlow({ params }: ScreenProps) {
  const goalId = paramString(params, "goalId");
  const { dispatch, nav } = usePreview();
  const ctx = useGoalContext(goalId);
  const [amount, setAmount] = useState<number | null>(() => paramNumber(params, "amount") ?? null);
  const [confirm, setConfirm] = useState(false);
  if (!ctx || !goalId) return <GoalNotFound title="Nạp tiền" />;

  const { goal, account, state, value, stage } = ctx;
  const balance = state.customer.mainCasaBalance;
  const blocked = !canTransact(goal) || !account || account.status === "closed";
  const valid = amount !== null && amount > 0 && amount <= balance;
  const over = amount !== null && amount > balance;
  const phase2 = stage.phase === 2;
  const chips = [
    ...(ctx.required > 0 ? [{ label: `${phase2 ? "Đủ kỳ trả góp" : "Đủ kịp hạn"} · ${formatVndCompact(ctx.required)}`, amount: ctx.required }] : []),
    ...(balance > 0 ? [{ label: `Tối đa · ${formatVndCompact(balance)}`, amount: balance }] : []),
  ];
  // Progress of the current phase (phase 2 = loan principal), before and after this deposit.
  const nowPct = Math.round((stage.value / Math.max(1, stage.target)) * 100);
  const after = stage.value + (valid ? amount! : 0);
  const afterPct = Math.round((after / Math.max(1, stage.target)) * 100);
  const reaches = valid && after >= stage.target;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title="Nạp tiền" subtitle={goal.name} />

      {blocked ? (
        <p className={warningBox}>Mục tiêu này không còn nhận thêm tiền.</p>
      ) : (
        <>
          <section className={`${card} flex items-center justify-between gap-3 !py-3`}>
            <span className="text-[13px] text-muted">Từ TK chính ••{state.customer.mainCasaNumber.slice(-4)}</span>
            <span className="text-[16px] font-semibold tabular-nums text-text">{formatVnd(balance)}</span>
          </section>

          <AmountCard
            title="Số tiền muốn nạp"
            value={amount}
            onChange={setAmount}
            chips={chips}
            autoFocus
            error={over ? `Tài khoản chính chỉ còn ${formatVnd(balance)}.` : undefined}
            help={ctx.required > 0 ? `${phase2 ? "Kỳ trả góp" : "Mức cần góp mỗi tháng để kịp hạn"}: ${formatVnd(ctx.required)}.` : undefined}
          />

          <section className={`${card} flex flex-col gap-3`} aria-label="Tiến độ sau khi nạp">
            <div className="flex items-center justify-between gap-2">
              <h2 className={sectionTitle}>{phase2 ? "Tiến độ trả khoản vay" : "Tiến độ mục tiêu"}</h2>
              <span className={`text-[13px] font-semibold tabular-nums ${reaches ? "text-positive" : "text-text"}`}>
                {!valid ? `${nowPct}%` : reaches ? `${nowPct}% → Đủ ✓` : `${nowPct}% → ${afterPct}%`}
              </span>
            </div>
            <SplitProgressBar
              cash={stage.principalPaid + value.cash}
              assets={value.assets}
              pending={valid ? amount! : 0}
              target={stage.target}
              showLegend={false}
            />
          </section>
        </>
      )}

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid || blocked} onClick={() => setConfirm(true)}>
          {valid ? `Nạp ${formatVndCompact(amount!)}` : "Nạp tiền"}
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title="Xác nhận nạp tiền"
        rows={[
          { label: "Từ", value: `TK chính ${state.customer.mainCasaNumber}` },
          { label: "Vào", value: account?.number ?? "—" },
          { label: "Số tiền", value: amount ?? 0, source: "msb", emphasis: true },
          { label: "Số dư TK chính sau nạp", value: balance - (amount ?? 0), source: "msb" },
        ]}
        confirmLabel="Nạp tiền"
        onConfirm={() => {
          dispatch({ type: "deposit", goalId, amount: amount ?? 0 });
          nav.pop();
        }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
