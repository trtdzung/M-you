"use client";

import { useState } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { Amount } from "../../shared/Amount";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { MoneyInput } from "../../shared/MoneyInput";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { card, chip, chipSelected, infoBox, input, label, primaryButton, secondaryButton, warningBox } from "../../shared/styles";
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

  const { goal, account, value, fe } = ctx;
  const balance = account?.balance ?? 0;
  const blocked = !canTransact(goal) || !account || account.status === "closed";
  const over = amount !== null && amount > balance;
  const large = amount !== null && !emergency && (amount >= 10_000_000 || amount >= balance * 0.3);
  const phraseOk = !large || phrase.trim().toLowerCase() === PHRASE.toLowerCase();
  const valid = amount !== null && amount > 0 && !over && reason !== null && phraseOk;
  const hasAssets = value.assets > 0;

  const afterTotal = value.total - (amount ?? 0);
  const afterPct = Math.round((afterTotal / Math.max(1, goal.targetAmount)) * 100);
  const pace = goal.standingOrder?.active ? goal.standingOrder.amount : typeof fe.allocatedMonthly === "number" ? fe.allocatedMonthly : 0;
  const delayMonths = amount && pace > 0 ? Math.ceil(amount / pace) : null;
  const newRequired =
    amount && fe.monthsLeft > 0 ? Math.ceil((Math.max(0, goal.targetAmount - afterTotal)) / fe.monthsLeft / 1000) * 1000 : null;
  const reasons = emergency ? EMERGENCY_REASONS : REASONS;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title={emergency ? "Rút tiền khẩn cấp" : "Rút tiền"} subtitle={goal.name} />

      {emergency ? (
        <p className={infoBox}>
          Bạn cần tiền gấp — không sao cả, đó là lý do quỹ này tồn tại. Chọn số tiền cần dùng, M-You sẽ tính lại kế hoạch giúp bạn sau.
        </p>
      ) : (
        <p className={warningBox}>Rút tiền sẽ làm mục tiêu chậm lại. Hãy xem tác động bên dưới trước khi quyết định.</p>
      )}

      {blocked ? (
        <p className={warningBox}>Mục tiêu này không thể rút thêm tiền.</p>
      ) : (
        <>
          <section className={`${card} flex items-center justify-between gap-3`}>
            <p className="text-sm text-muted">Tiền có thể rút (tài khoản mục tiêu)</p>
            <Amount amount={balance} source="msb" className="text-sm font-semibold text-text" />
          </section>

          <MoneyInput label="Số tiền muốn rút" value={amount} onChange={setAmount} max={balance} autoFocus />

          {over && (
            <div className={`${infoBox} flex flex-col gap-2`}>
              <p>Số tiền vượt quá tiền mặt trong tài khoản mục tiêu.{hasAssets ? " Phần còn lại đang nằm trong tài sản — bạn có thể bán bớt tài sản trước." : ""}</p>
              {hasAssets && (
                <button type="button" className={secondaryButton} onClick={() => nav.push("GoalDetail", { goalId, tab: "assets" })}>
                  Xem tài sản để bán
                </button>
              )}
            </div>
          )}

          {amount !== null && amount > 0 && !over && (
            <section className={`${card} flex flex-col gap-2`} aria-label="Tác động của việc rút">
              <p className="text-sm font-semibold text-text">Nếu rút {formatVnd(amount)}</p>
              <p className="text-[13px] text-muted">
                Tiến độ giảm từ {Math.round(ctx.pct)}% xuống {afterPct}%.
                {delayMonths !== null ? ` Với mức góp hiện tại, mục tiêu có thể chậm khoảng ${delayMonths} tháng.` : ""}
              </p>
              {newRequired !== null && newRequired > 0 && (
                <p className="text-[13px] text-muted">
                  Hoặc bạn cần góp khoảng {formatVnd(newRequired)}/tháng (hiện {formatVnd(ctx.required)}) để kịp hạn.
                </p>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <p className={label}>Lý do rút</p>
            <div className="flex flex-wrap gap-2">
              {reasons.map((r) => (
                <button key={r} type="button" className={reason === r ? chipSelected : chip} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
          </section>

          {large && (
            <section className="flex flex-col gap-1.5">
              <label htmlFor="withdraw-phrase" className={label}>
                Khoản rút lớn — gõ “{PHRASE}” để xác nhận
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
          Tiếp tục
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
