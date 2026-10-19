"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { assetValue, formatISODate, goalAssets } from "../../../engine";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions } from "../../shared/BottomActions";
import { ConfirmSheet } from "../../shared/ConfirmSheet";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SummaryRows } from "../../shared/SummaryRows";
import { card, errorBox, primaryButton, secondaryButton, sectionTitle, warningBox } from "../../shared/styles";
import { GoalNotFound, useGoalContext } from "./common";

/** Đóng mục tiêu: giải thích hậu quả rồi xác nhận. */
export function CloseGoalFlow({ params }: ScreenProps) {
  const goalId = paramString(params, "goalId");
  const { dispatch, nav, state } = usePreview();
  const ctx = useGoalContext(goalId);
  const [confirm, setConfirm] = useState(false);
  if (!ctx || !goalId) return <GoalNotFound title="Đóng mục tiêu" />;

  const { goal, account, value } = ctx;
  const loan = state.loans.find((l) => l.id === goal.loanId);
  const loanActive = loan?.status === "active";
  const done = goal.status === "closed" || goal.status === "completed";
  const liquid = goalAssets(state, goalId).filter((a) => a.type === "liquid");
  const fixed = goalAssets(state, goalId).filter((a) => a.type === "fixed");
  const liquidTotal = liquid.reduce((s, a) => s + assetValue(a, state), 0);
  const earlyDeposits = liquid.filter((a) => a.maturityDate && a.maturityDate > state.clock.today);
  const toMain = value.cash + liquidTotal;

  function goToList() {
    if (nav.stack.some((e) => e.screen === "GoalList")) nav.popTo("GoalList");
    else nav.replace("GoalList");
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title="Đóng mục tiêu" subtitle={goal.name} />

      {loanActive ? (
        <section className={`${errorBox} flex flex-col gap-2`}>
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} aria-hidden /> Chưa thể đóng mục tiêu
          </p>
          <p className="text-[13px] text-muted">
            Mục tiêu còn khoản vay chưa trả hết ({formatVnd(loan!.schedule.filter((r) => r.status !== "paid").reduce((s, r) => s + r.principal, 0))} gốc còn lại).
            Hãy trả hết hoặc tất toán trước, sau đó bạn có thể đóng mục tiêu.
          </p>
          <button type="button" className={secondaryButton} onClick={() => nav.push("RepayOverview", { goalId })}>
            Xem khoản vay
          </button>
        </section>
      ) : done ? (
        <p className={warningBox}>Mục tiêu này đã {goal.status === "closed" ? "đóng" : "hoàn thành"}.</p>
      ) : (
        <>
          <section className={`${card} flex flex-col gap-3`}>
            <h2 className={sectionTitle}>Khi đóng mục tiêu</h2>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-text">
              <li>Tiền trong tài khoản mục tiêu ({formatVnd(value.cash)}) được chuyển về tài khoản chính.</li>
              <li>Tài sản linh hoạt ({liquid.length}) được bán hoặc tất toán, tiền về tài khoản chính.</li>
              <li>Tài sản cố định ({fixed.length}) chỉ được gỡ khỏi mục tiêu, bạn vẫn giữ chúng.</li>
              <li>Tài khoản mục tiêu bị đóng, không thể mở lại. Lịch sử vẫn xem được.</li>
            </ul>
          </section>

          {earlyDeposits.length > 0 && (
            <section className={`${warningBox} flex flex-col gap-1`}>
              <p className="font-semibold">Có khoản chưa đến hạn</p>
              {earlyDeposits.map((a) => (
                <p key={a.id} className="text-[13px] text-muted">
                  {a.name} đáo hạn {formatISODate(a.maturityDate)} — tất toán sớm sẽ mất phần lớn lãi, có thể bị phạt.
                </p>
              ))}
            </section>
          )}
          {liquid.some((a) => a.category === "fund") && (
            <p className={warningBox}>Quỹ bán dưới thời hạn miễn phí có thể bị tính phí bán, và giá bán theo giá thị trường hôm nay.</p>
          )}

          <SummaryRows
            rows={[
              { label: "Tiền mặt về tài khoản chính", value: value.cash, source: "msb" },
              { label: "Tài sản linh hoạt (ước tính)", value: liquidTotal, source: "estimated" },
              { label: "Dự kiến nhận về", value: toMain, source: "estimated", emphasis: true },
            ]}
          />
        </>
      )}

      <BottomActions>
        {!loanActive && !done ? (
          <button type="button" className={`${primaryButton} bg-negative`} onClick={() => setConfirm(true)}>
            Đóng mục tiêu
          </button>
        ) : null}
        <button type="button" className={secondaryButton} onClick={() => nav.pop()}>
          Giữ lại mục tiêu
        </button>
      </BottomActions>

      <ConfirmSheet
        open={confirm}
        title="Đóng mục tiêu?"
        rows={[
          { label: "Mục tiêu", value: goal.name },
          { label: "Tài khoản đóng", value: account?.number ?? "—" },
          { label: "Dự kiến về TK chính", value: toMain, source: "estimated", emphasis: true },
        ]}
        note="Hành động này không hoàn tác được."
        confirmLabel="Đóng mục tiêu"
        danger
        onConfirm={() => {
          dispatch({ type: "closeGoal", goalId });
          goToList();
        }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
