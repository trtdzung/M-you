"use client";

import { useState } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { paramNumber, paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { Amount } from "../../shared/Amount";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { MoneyInput } from "../../shared/MoneyInput";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { card, infoBox, primaryButton, warningBox } from "../../shared/styles";
import { canTransact, GoalNotFound, useGoalContext } from "./common";

/** Nạp tiền vào tài khoản mục tiêu. */
export function DepositFlow({ params }: ScreenProps) {
  const goalId = paramString(params, "goalId");
  const { dispatch, nav } = usePreview();
  const ctx = useGoalContext(goalId);
  const [amount, setAmount] = useState<number | null>(() => paramNumber(params, "amount") ?? null);
  const [confirm, setConfirm] = useState(false);
  if (!ctx || !goalId) return <GoalNotFound title="Nạp tiền" />;

  const { goal, account, state, value } = ctx;
  const balance = state.customer.mainCasaBalance;
  const blocked = !canTransact(goal) || !account || account.status === "closed";
  const valid = amount !== null && amount > 0 && amount <= balance;
  const quick = Array.from(new Set([ctx.required, 1_000_000, 5_000_000].filter((n) => n > 0)));
  const after = value.total + (amount ?? 0);
  const afterPct = Math.round((after / Math.max(1, goal.targetAmount)) * 100);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title="Nạp tiền" subtitle={goal.name} />

      {blocked ? (
        <p className={warningBox}>Mục tiêu này không còn nhận thêm tiền.</p>
      ) : (
        <>
          <section className={`${card} flex items-center justify-between gap-3`}>
            <div>
              <p className="text-[12px] text-muted">Từ tài khoản chính</p>
              <p className="text-sm tabular-nums text-text">{state.customer.mainCasaNumber}</p>
            </div>
            <Amount amount={balance} source="msb" className="text-sm font-semibold text-text" />
          </section>

          <MoneyInput
            label="Số tiền muốn nạp"
            value={amount}
            onChange={setAmount}
            max={balance}
            quickAmounts={quick}
            hint={ctx.required > 0 ? `Mức cần góp mỗi tháng để kịp hạn: ${formatVnd(ctx.required)}` : undefined}
            autoFocus
          />

          {valid && (
            <section className={`${card} flex flex-col gap-3`} aria-label="Ảnh hưởng đến tiến độ">
              <p className="text-sm font-semibold text-text">Sau khi nạp</p>
              <SplitProgressBar cash={value.cash + amount!} assets={value.assets} target={goal.targetAmount} />
              <p className="text-[13px] text-muted">
                Tiến độ từ {Math.round(ctx.pct)}% lên {afterPct}%.{" "}
                {after >= goal.targetAmount ? "Bạn sẽ đủ tiền cho mục tiêu." : `Còn thiếu ${formatVnd(goal.targetAmount - after)}.`}
              </p>
            </section>
          )}
          {amount !== null && amount > balance && <p className={infoBox}>Tài khoản chính không đủ số dư cho khoản này.</p>}
        </>
      )}

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid || blocked} onClick={() => setConfirm(true)}>
          Tiếp tục
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
