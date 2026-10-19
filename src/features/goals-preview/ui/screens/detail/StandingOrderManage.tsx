"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";
import { formatISODate } from "../../../engine";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { selectGoalTxns } from "../../../store/selectors";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { MoneyInput } from "../../shared/MoneyInput";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SummaryRows } from "../../shared/SummaryRows";
import { card, dangerButton, errorBox, infoBox, input, label, primaryButton, secondaryButton, sectionTitle } from "../../shared/styles";
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

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title="Trích tiền tự động" subtitle={goal.name} />

      {exists && (
        <section className={`${card} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <h2 className={sectionTitle}>Hiện tại</h2>
            <span className={so!.active ? "text-sm font-semibold text-positive" : "text-sm font-semibold text-muted"}>
              {so!.active ? "Đang bật" : "Đang tắt"}
            </span>
          </div>
          <SummaryRows
            rows={[
              { label: "Số tiền mỗi tháng", value: so!.amount, source: "msb" },
              { label: "Ngày trích", value: `Ngày ${so!.dayOfMonth} hằng tháng` },
              { label: "Lần trích kế tiếp", value: so!.active ? formatISODate(so!.nextRunDate) : "—" },
              {
                label: "Lần gần nhất",
                value: so!.lastRunDate ? `${formatISODate(so!.lastRunDate)} · ${so!.lastResult === "failed" ? "Không thành công" : "Thành công"}` : "Chưa chạy",
              },
            ]}
          />
        </section>
      )}

      {exists && (so!.failedCount > 0 || so!.lastResult === "failed") && (
        <section className={`${errorBox} flex flex-col gap-2`}>
          <p className="font-semibold">Lần trích gần nhất không thành công</p>
          <p className="text-[13px] text-muted">
            Tài khoản chính không đủ {formatVnd(so!.amount)} (hiện có {formatVnd(balance)}). Đã lỗi {so!.failedCount} lần liên tiếp. Bạn có thể nạp bù để không lệch kế hoạch.
          </p>
          {failures.slice(0, 3).map((t) => (
            <p key={t.id} className="text-[12px] text-muted">
              {formatISODate(t.date)} · {t.note || "Không đủ số dư"}
            </p>
          ))}
          <button type="button" className={secondaryButton} onClick={() => nav.push("DepositFlow", { goalId, amount: so!.amount })}>
            Nạp bù {formatVnd(so!.amount)}
          </button>
        </section>
      )}

      {blocked ? (
        <p className={infoBox}>Mục tiêu này không còn dùng trích tự động.</p>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className={sectionTitle}>{exists ? "Chỉnh sửa" : "Thiết lập mới"}</h2>
          <MoneyInput
            label="Số tiền trích mỗi tháng"
            value={amount}
            onChange={setAmount}
            quickAmounts={Array.from(new Set([ctx.required, 1_000_000, 5_000_000].filter((n) => n > 0)))}
            hint={ctx.required > 0 ? `Mức cần góp để kịp hạn: ${formatVnd(ctx.required)}/tháng` : undefined}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="so-day" className={label}>
              Ngày trích trong tháng
            </label>
            <select id="so-day" value={day} onChange={(e) => setDay(Number(e.target.value))} className={input}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Ngày {d}
                </option>
              ))}
            </select>
            <p className="text-[13px] text-muted">Nên chọn ngày sau ngày nhận lương ({state.customer.salaryDay}) để đủ số dư.</p>
          </div>

          {exists && (
            <div className="flex flex-col gap-2">
              {so!.active ? (
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => dispatch({ type: "setStandingOrder", goalId, amount: so!.amount, dayOfMonth: so!.dayOfMonth, active: false })}
                >
                  Tạm dừng trích
                </button>
              ) : (
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => dispatch({ type: "setStandingOrder", goalId, amount: so!.amount, dayOfMonth: so!.dayOfMonth, active: true })}
                >
                  Bật lại trích tự động
                </button>
              )}
              <button type="button" className={dangerButton} onClick={() => setPending("cancel")}>
                Huỷ lệnh trích
              </button>
            </div>
          )}
        </section>
      )}

      {!blocked && (
        <BottomActions>
          <button type="button" className={primaryButton} disabled={!valid || !changed} onClick={() => setPending("save")}>
            {exists ? "Lưu thay đổi" : "Bật trích tự động"}
          </button>
        </BottomActions>
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
