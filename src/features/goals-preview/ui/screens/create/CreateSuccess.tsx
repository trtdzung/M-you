"use client";

import { useState } from "react";
import { Check, Copy, PartyPopper } from "lucide-react";
import { formatVndCompact } from "@/features/goals-preview/format-money";
import { formatISODate } from "../../../engine/dates";
import { requiredMonthly } from "../../../engine/feasibility";
import { goalValue } from "../../../engine/value";
import type { ScreenProps } from "../../../model/screens";
import { paramString } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions } from "../../shared/BottomActions";
import { EmptyState } from "../../shared/EmptyState";
import { ScreenHeader } from "../../shared/ScreenHeader";
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

  const autoText =
    order && order.active ? `${formatVndCompact(order.amount)} · ngày ${order.dayOfMonth}` : "Chưa cài";

  // Gọn trong một màn hình, không cần cuộn: chúc mừng, tài khoản, 4 số chính và nút hành động.
  return (
    <div className={screenPadding}>
      <ScreenHeader title="Đã tạo mục tiêu" hideBack />

      <section className="flex items-center gap-3 rounded-card bg-positive-soft px-4 py-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-positive">
          <PartyPopper size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className={`${emphasisTitle} !text-[17px]`}>Chúc mừng bạn!</h2>
          <p className="truncate text-[13px] text-text">“{goal.name}” đã sẵn sàng.</p>
        </div>
      </section>

      <section className={`${card} flex flex-col gap-1.5`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={sectionTitle}>Tài khoản mục tiêu</h2>
          <button type="button" onClick={copy} className={`${ghostButton} ${ring} !min-h-9`} aria-label="Sao chép số tài khoản">
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? "Đã chép" : "Sao chép"}
          </button>
        </div>
        <p className="text-[20px] font-bold tabular-nums tracking-wide text-text">{formatAccountNumber(account.number)}</p>
        <p className="truncate text-[13px] text-muted">{account.name}</p>
      </section>

      <section className={`${card} flex flex-col gap-3`} aria-label="Kế hoạch tháng đầu tiên">
        <h2 className={sectionTitle}>Kế hoạch tháng đầu tiên</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {[
            { label: "Số dư hiện tại", value: formatVndCompact(value.total) },
            { label: "Mục tiêu", value: formatVndCompact(goal.targetAmount) },
            { label: "Đạt vào", value: formatISODate(goal.targetDate) },
            { label: "Cần tiết kiệm/tháng", value: typeof monthly === "number" ? formatVndCompact(monthly) : "Chưa rõ" },
            { label: "Trích tự động", value: autoText },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-[13px] text-muted">{row.label}</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-text">{row.value}</dd>
            </div>
          ))}
        </dl>
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
