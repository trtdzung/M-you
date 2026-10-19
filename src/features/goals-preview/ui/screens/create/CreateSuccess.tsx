"use client";

import { useState } from "react";
import { Check, Copy, PartyPopper } from "lucide-react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { formatISODate } from "../../../engine/dates";
import { requiredMonthly } from "../../../engine/feasibility";
import { goalValue } from "../../../engine/value";
import type { ScreenProps } from "../../../model/screens";
import { paramString } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions } from "../../shared/BottomActions";
import { EmptyState } from "../../shared/EmptyState";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SummaryRows } from "../../shared/SummaryRows";
import { card, ghostButton, primaryButton, ring, screenPadding, sectionTitle, emphasisTitle } from "../../shared/styles";
import { formatAccountNumber } from "./wizard";

/** Màn hình thành công sau khi mở tài khoản mục tiêu. */
export function CreateSuccess({ params }: ScreenProps) {
  const { state, nav, toast } = usePreview();
  const [copied, setCopied] = useState(false);
  const goalId = paramString(params, "goalId");
  const goal = goalId ? state.goals.find((g) => g.id === goalId) : undefined;
  const account = goal?.accountId ? state.accounts.find((a) => a.id === goal.accountId) : undefined;

  const toList = () => {
    nav.reset("GoalList");
  };

  if (!goal || !account) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Đã tạo mục tiêu" hideBack />
        <EmptyState title="Không tìm thấy mục tiêu" description="Mục tiêu có thể đã bị xoá." ctaLabel="Về danh sách" onCta={toList} />
      </div>
    );
  }

  const value = goalValue(state, goal);
  const order = goal.standingOrder;
  const monthly = requiredMonthly(state, goal);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.number);
      setCopied(true);
      toast("Đã sao chép số tài khoản.", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(`Số tài khoản: ${account.number}`, "info");
    }
  };

  const viewGoal = () => {
    nav.reset("GoalList");
    nav.push("GoalDetail", { goalId: goal.id });
  };

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Đã tạo mục tiêu" hideBack />

      <section className="flex flex-col items-center gap-2 rounded-card bg-positive-soft px-4 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-positive">
          <PartyPopper size={28} aria-hidden />
        </span>
        <h2 className={emphasisTitle}>Chúc mừng bạn!</h2>
        <p className="text-sm text-text">
          Mục tiêu “{goal.name}” đã sẵn sàng. Hãy bắt đầu dành dụm từng chút một.
        </p>
      </section>

      <section className={`${card} flex flex-col gap-2`}>
        <h2 className={sectionTitle}>Tài khoản mục tiêu</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[20px] font-bold tabular-nums tracking-wide text-text">{formatAccountNumber(account.number)}</p>
          <button type="button" onClick={copy} className={`${ghostButton} ${ring}`} aria-label="Sao chép số tài khoản">
            {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
            {copied ? "Đã chép" : "Sao chép"}
          </button>
        </div>
        <p className="text-[13px] text-muted">{account.name}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={sectionTitle}>Kế hoạch tháng đầu tiên</h2>
        <SummaryRows
          rows={[
            { label: "Số dư hiện tại", value: value.total, source: value.fixedCounted > 0 ? "self_reported" : "msb", emphasis: true },
            { label: "Mục tiêu", value: `${formatVnd(goal.targetAmount)} · ${formatISODate(goal.targetDate)}` },
            { label: "Cần tiết kiệm mỗi tháng", value: monthly, source: "estimated" },
            order && order.active
              ? { label: "Trích tự động", value: `${formatVnd(order.amount)} · ngày ${order.dayOfMonth} hằng tháng`, hint: `Lần đầu ${formatISODate(order.nextRunDate)}` }
              : { label: "Trích tự động", value: "Chưa cài", hint: "Bạn có thể cài trong chi tiết mục tiêu" },
          ]}
        />
      </section>

      <BottomActions inline>
        <button type="button" className={primaryButton} onClick={viewGoal}>
          Xem mục tiêu
        </button>
        <button type="button" className={`${ghostButton} self-center`} onClick={toList}>
          Về danh sách
        </button>
      </BottomActions>
    </div>
  );
}
