"use client";

import { useState } from "react";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { AmountCard, formatShort } from "../../shared/AmountCard";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { card, chip, chipSelected, infoBox, input, primaryButton, secondaryButton, sectionTitle, warningBox } from "../../shared/styles";
import { canTransact, GoalNotFound, useGoalContext } from "./common";

const REASONS = ["Chi tiêu cần thiết", "Việc gia đình", "Cơ hội đầu tư khác", "Đổi kế hoạch", "Khác"];
const EMERGENCY_REASONS = ["Y tế", "Mất thu nhập", "Sửa chữa khẩn cấp", "Khác"];
const PHRASE = "Tôi hiểu và muốn rút";

/** Rút tiền về tài khoản chính, có ma sát để tránh rút bốc đồng. */
export function WithdrawFlow({ params }: ScreenProps) {
  const goalId = paramString(params, "goalId");
  const emergency = params.emergency === true || params.emergency === "true" || params.emergency === 1;
  const { dispatch, nav } = usePreview();
  const ctx = useGoalContext(goalId);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [confirm, setConfirm] = useState(false);
  if (!ctx || !goalId) return <GoalNotFound title="Rút tiền" />;

  const { goal, account, value, fe, stage } = ctx;
  const balance = account?.balance ?? 0;
  const blocked = !canTransact(goal) || !account || account.status === "closed";
  const over = amount !== null && amount > balance;
  const large = amount !== null && !emergency && (amount >= 10_000_000 || amount >= balance * 0.3);
  const phraseOk = !large || phrase.trim().toLowerCase() === PHRASE.toLowerCase();
  const valid = amount !== null && amount > 0 && !over && reason !== null && phraseOk;
  const hasAssets = value.assets > 0;
  const showImpact = amount !== null && amount > 0 && !over;

  // Progress of the current phase (phase 2 = loan principal), before and after this withdrawal.
  const nowPct = Math.round((stage.value / Math.max(1, stage.target)) * 100);
  const afterValue = stage.value - (showImpact ? amount! : 0);
  const afterPct = Math.round((afterValue / Math.max(1, stage.target)) * 100);
  const pace = goal.standingOrder?.active ? goal.standingOrder.amount : typeof fe.allocatedMonthly === "number" ? fe.allocatedMonthly : 0;
  const delayMonths = showImpact && pace > 0 ? Math.ceil(amount! / pace) : null;
  const impactTip = [
    delayMonths !== null ? `Với mức góp hiện tại (${formatVnd(pace)}/tháng), mục tiêu có thể chậm khoảng ${delayMonths} tháng.` : "",
    "Rút trước khi đạt mục tiêu làm kế hoạch chậm lại.",
  ].filter(Boolean).join(" ");
  const reasons = emergency ? EMERGENCY_REASONS : REASONS;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title={emergency ? "Rút tiền khẩn cấp" : "Rút tiền"} subtitle={goal.name} />

      {emergency && <p className={infoBox}>Bạn cần tiền gấp, không sao cả, đó là lý do quỹ này tồn tại. M-You sẽ tính lại kế hoạch giúp bạn sau.</p>}

      {blocked ? (
        <p className={warningBox}>Mục tiêu này không thể rút thêm tiền.</p>
      ) : (
        <>
          <section className={`${card} flex items-center justify-between gap-3 !py-3`}>
            <span className="text-[13px] text-muted">Có thể rút · TK mục tiêu</span>
            <span className="text-[16px] font-semibold tabular-nums text-text">{formatVnd(balance)}</span>
          </section>

          <AmountCard
            title="Số tiền muốn rút"
            value={amount}
            onChange={setAmount}
            chips={balance > 0 ? [{ label: `Tối đa ${formatShort(balance)}`, amount: balance }] : []}
            autoFocus
            error={over ? `Tài khoản mục tiêu chỉ có ${formatVnd(balance)} tiền mặt.` : undefined}
          />

          {over && hasAssets && (
            <div className={`${infoBox} flex flex-col gap-2`}>
              <p>Phần còn lại đang nằm trong tài sản. Bạn có thể bán bớt tài sản trước.</p>
              <button type="button" className={secondaryButton} onClick={() => nav.push("GoalDetail", { goalId, tab: "assets" })}>
                Xem tài sản để bán
              </button>
            </div>
          )}

          <section className={`${card} flex flex-col gap-3`} aria-label="Tác động của việc rút">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <h2 className={sectionTitle}>{stage.phase === 2 ? "Tiến độ trả khoản vay" : "Tiến độ mục tiêu"}</h2>
                <InfoTooltip label="tác động của việc rút" warning={showImpact} text={impactTip} />
              </div>
              <span className={cn("text-[13px] font-semibold tabular-nums", showImpact ? "text-negative" : "text-text")}>
                {showImpact ? `${nowPct}% → ${afterPct}%` : `${nowPct}%`}
              </span>
            </div>
            <SplitProgressBar
              cash={Math.max(0, stage.principalPaid + value.cash - (showImpact ? amount! : 0))}
              assets={value.assets}
              target={stage.target}
              showLegend={false}
            />
          </section>

          <section className={`${card} flex flex-col gap-3`} aria-label="Lý do rút">
            <h2 className={sectionTitle}>Lý do rút</h2>
            <div className="flex flex-wrap gap-2">
              {reasons.map((r) => (
                <button key={r} type="button" className={reason === r ? chipSelected : chip} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
          </section>

          {large && (
            <section className={`${card} flex flex-col gap-2`} aria-label="Xác nhận khoản rút lớn">
              <label htmlFor="withdraw-phrase" className={sectionTitle}>
                Khoản rút lớn: gõ “{PHRASE}”
              </label>
              <input
                id="withdraw-phrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                className={cn(input, phrase && !phraseOk && "border-warning")}
                placeholder={PHRASE}
              />
            </section>
          )}
        </>
      )}

      <BottomActions>
        <button type="button" className={primaryButton} disabled={!valid || blocked} onClick={() => setConfirm(true)}>
          {showImpact ? `Rút ${formatVndCompact(amount!)}` : "Rút tiền"}
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title="Xác nhận rút tiền"
        rows={[
          { label: "Từ", value: account?.number ?? "—" },
          { label: "Về", value: `TK chính ${ctx.state.customer.mainCasaNumber}` },
          { label: "Số tiền", value: amount ?? 0, source: "msb", emphasis: true },
          { label: "Lý do", value: reason ?? "—" },
          { label: "Tiến độ sau khi rút", value: `${afterPct}%` },
        ]}
        confirmLabel="Rút tiền"
        onConfirm={() => {
          dispatch({
            type: "withdraw",
            goalId,
            amount: amount ?? 0,
            emergency: emergency || undefined,
            note: `${emergency ? "Rút khẩn cấp" : "Rút về tài khoản chính"} — ${reason ?? ""}`,
          });
          nav.pop();
        }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
