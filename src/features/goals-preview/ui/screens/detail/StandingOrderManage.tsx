"use client";

import { useState } from "react";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { formatISODate } from "../../../engine";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { selectGoalTxns } from "../../../store/selectors";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { MoneyInput } from "../../shared/MoneyInput";
import { DayOfMonthPicker, Switch } from "../../shared/Pickers";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { card, chip, chipSelected, errorBox, ghostButton, infoBox, primaryButton, secondaryButton, sectionTitle } from "../../shared/styles";
import { canTransact, GoalNotFound, useGoalContext } from "./common";

type Pending = "save" | "cancel" | null;

/** Quản lý lệnh trích tiền tự động hằng tháng. */
export function StandingOrderManage({ params }: ScreenProps) {
  const goalId = paramString(params, "goalId");
  const { dispatch, nav } = usePreview();
  const ctx = useGoalContext(goalId);
  const so = ctx?.goal.standingOrder;
  const [amount, setAmount] = useState<number | null>(() => (so && so.amount > 0 ? so.amount : ctx?.required || null));
  const [day, setDay] = useState<number>(() => so?.dayOfMonth ?? ctx?.state.customer.salaryDay ?? 5);
  const [pending, setPending] = useState<Pending>(null);
  if (!ctx || !goalId) return <GoalNotFound title="Trích tiền tự động" />;

  const { goal, state, account } = ctx;
  const exists = !!so && so.amount > 0;
  const blocked = !canTransact(goal) || !account;
  const failures = selectGoalTxns(state, goalId).filter((t) => t.kind === "standing_order_failed");
  const valid = amount !== null && amount > 0;
  const changed = !exists || amount !== so!.amount || day !== so!.dayOfMonth;
  const balance = state.customer.mainCasaBalance;

  const active = exists && so!.active;
  const lastLine = so?.lastRunDate
    ? `Lần trước ${formatISODate(so.lastRunDate)} ${so.lastResult === "failed" ? "· không thành công" : "✓"}`
    : "Chưa trích lần nào";

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title="Trích tiền tự động" subtitle={goal.name} />

      {exists && (
        <section className={`${card} flex flex-col gap-1`} aria-label="Trạng thái trích tự động">
          <div className="flex items-center justify-between gap-3">
            <h2 className={sectionTitle}>{active ? "Đang bật" : "Đang tạm dừng"}</h2>
            {!blocked && (
              <Switch
                checked={active}
                label="Bật trích tự động"
                onChange={(next) => dispatch({ type: "setStandingOrder", goalId, amount: so!.amount, dayOfMonth: so!.dayOfMonth, active: next })}
              />
            )}
          </div>
          <p className="text-[13px] text-muted">
            {active ? `${formatVnd(so!.amount)} · ngày ${so!.dayOfMonth} · lần tới ${formatISODate(so!.nextRunDate)}` : "Bật lại để tiếp tục trích hằng tháng."}
          </p>
          <p className="text-[13px] text-muted">{lastLine}</p>
        </section>
      )}

      {exists && (so!.failedCount > 0 || so!.lastResult === "failed") && (
        <section className={`${errorBox} flex flex-col gap-2`}>
          <div className="flex items-center gap-1">
            <p className="font-semibold">Lần trích gần nhất không thành công</p>
            <InfoTooltip
              warning
              label="lý do trích không thành công"
              text={`Tài khoản chính không đủ ${formatVnd(so!.amount)} (hiện có ${formatVnd(balance)}). Đã lỗi ${so!.failedCount} lần liên tiếp.${failures[0] ? ` Gần nhất: ${formatISODate(failures[0].date)}.` : ""}`}
            />
          </div>
          <button type="button" className={secondaryButton} onClick={() => nav.push("DepositFlow", { goalId, amount: so!.amount })}>
            Nạp bù {formatVnd(so!.amount)}
          </button>
        </section>
      )}

      {blocked ? (
        <p className={infoBox}>Mục tiêu này không còn dùng trích tự động.</p>
      ) : (!exists || active) && (
        <>
          <section className={`${card} flex flex-col gap-3`} aria-label="Số tiền mỗi tháng">
            <MoneyInput label="Số tiền mỗi tháng" value={amount} onChange={setAmount} />
            {ctx.required > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={amount === ctx.required ? chipSelected : chip} onClick={() => setAmount(ctx.required)}>
                  Đủ kịp hạn · {formatVndCompact(ctx.required)}
                </button>
              </div>
            )}
          </section>

          <section className={`${card} flex flex-col gap-3`} aria-label="Ngày trích">
            <div className="flex items-center gap-1">
              <h2 className={sectionTitle}>Ngày trích hằng tháng</h2>
              <InfoTooltip label="chọn ngày trích" text={`Nên chọn sau ngày nhận lương (ngày ${state.customer.salaryDay}) để tài khoản chính đủ tiền.`} />
            </div>
            <DayOfMonthPicker value={day} onChange={setDay} />
          </section>

          <BottomActions inline>
            <button type="button" className={primaryButton} disabled={!valid || !changed} onClick={() => setPending("save")}>
              {exists ? "Lưu thay đổi" : "Bật trích tự động"}
            </button>
          </BottomActions>
        </>
      )}

      {exists && !blocked && (
        <button type="button" className={`${ghostButton} self-center !text-negative`} onClick={() => setPending("cancel")}>
          Huỷ lệnh trích
        </button>
      )}

      <ConfirmSheet
        open={pending === "save"}
        title="Xác nhận trích tự động"
        rows={[
          { label: "Từ", value: `TK chính ${state.customer.mainCasaNumber}` },
          { label: "Vào", value: account?.number ?? "—" },
          { label: "Số tiền mỗi tháng", value: amount ?? 0, source: "msb", emphasis: true },
          { label: "Ngày trích", value: `Ngày ${day} hằng tháng` },
        ]}
        confirmLabel="Xác nhận"
        onConfirm={() => dispatch({ type: "setStandingOrder", goalId, amount: amount ?? 0, dayOfMonth: day, active: true })}
        onClose={() => setPending(null)}
      />
      <ConfirmSheet
        open={pending === "cancel"}
        title="Huỷ lệnh trích tự động?"
        rows={[{ label: "Số tiền đang trích", value: so?.amount ?? 0, source: "msb" }]}
        note="Bạn sẽ phải tự nạp tiền để kịp tiến độ. Có thể thiết lập lại bất cứ lúc nào."
        confirmLabel="Huỷ lệnh trích"
        danger
        onConfirm={() => dispatch({ type: "setStandingOrder", goalId, amount: 0, dayOfMonth: so?.dayOfMonth ?? day, active: false })}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
