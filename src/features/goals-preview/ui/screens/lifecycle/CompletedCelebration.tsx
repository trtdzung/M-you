"use client";

import { formatVnd } from "@/lib/format";
import { formatISODate, formatMonths, monthsBetween } from "../../../engine";
import { TEMPLATE_EMOJI } from "../../../model/labels";
import type { ScreenProps } from "../../../model/screens";
import { BottomActions, ScreenHeader, SummaryRows } from "../../shared";
import { primaryButton, screenPadding, secondaryButton, warningBox } from "../../shared/styles";
import { NotFoundScreen, Section, useLoanScreen } from "../loan/shared";

const CONFETTI = [
  { left: "6%", color: "bg-primary", delay: "0ms", size: "h-2.5 w-2.5" },
  { left: "16%", color: "bg-warning", delay: "150ms", size: "h-2 w-2" },
  { left: "27%", color: "bg-positive", delay: "300ms", size: "h-3 w-3" },
  { left: "38%", color: "bg-source-self", delay: "80ms", size: "h-2 w-2" },
  { left: "50%", color: "bg-primary", delay: "220ms", size: "h-2.5 w-2.5" },
  { left: "61%", color: "bg-warning", delay: "40ms", size: "h-3 w-3" },
  { left: "72%", color: "bg-positive", delay: "260ms", size: "h-2 w-2" },
  { left: "83%", color: "bg-source-self", delay: "120ms", size: "h-2.5 w-2.5" },
  { left: "93%", color: "bg-primary", delay: "340ms", size: "h-2 w-2" },
];

/** Hoàn thành mục tiêu: ăn mừng, tóm tắt hành trình, và bước tiếp theo. */
export function CompletedCelebration({ params }: ScreenProps) {
  const { state, goal, account, loan, nav } = useLoanScreen(params);
  if (!goal) return <NotFoundScreen title="Hoàn thành mục tiêu" onCta={() => nav.push("GoalList")} />;

  if (goal.status !== "completed") {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Hoàn thành mục tiêu" subtitle={goal.name} />
        <div className={warningBox}>Mục tiêu này chưa hoàn thành nên chưa có màn chúc mừng.</div>
        <BottomActions>
          <button type="button" className={primaryButton} onClick={() => nav.replace("GoalDetail", { goalId: goal.id })}>
            Về chi tiết mục tiêu
          </button>
        </BottomActions>
      </div>
    );
  }

  const txns = state.txns.filter((t) => t.goalId === goal.id);
  const sum = (kinds: string[]) => txns.filter((t) => kinds.includes(t.kind)).reduce((s, t) => s + t.amount, 0);
  const deposited = sum(["deposit", "standing_order"]);
  const interest = sum(["interest"]);
  const repaid = sum(["loan_repayment"]);
  const completedAt = goal.completedAt ?? state.clock.today;
  const months = Math.max(0, monthsBetween(goal.createdAt, completedAt));
  const balance = account?.balance ?? 0;

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Hoàn thành mục tiêu" />

      <section className="relative overflow-hidden rounded-card bg-primary-soft px-4 pb-6 pt-8 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className={`absolute top-3 rounded-full ${c.color} ${c.size} animate-bounce motion-reduce:animate-none`}
              style={{ left: c.left, animationDelay: c.delay }}
            />
          ))}
        </div>
        <div className="text-[56px] leading-none" aria-hidden>
          {TEMPLATE_EMOJI[goal.template]}
        </div>
        <h2 className="mt-3 text-[22px] font-bold leading-7 text-text">Chúc mừng bạn!</h2>
        <p className="mt-1 text-sm leading-5 text-muted">
          “{goal.name}” đã hoàn thành{goal.completedEarly ? " sớm hơn dự kiến" : ""}, đạt {formatVnd(goal.finalValue ?? goal.targetAmount)}.
        </p>
      </section>

      <Section title="Hành trình của bạn">
        <SummaryRows
          rows={[
            { label: "Thời gian", value: `${formatMonths(months)}`, hint: `${formatISODate(goal.createdAt)} đến ${formatISODate(completedAt)}` },
            { label: "Tổng tiền đã nạp", value: deposited, source: "msb" },
            { label: "Lãi nhận được", value: interest, source: "msb" },
            ...(loan ? [{ label: "Khoản vay đã trả", value: repaid > 0 ? repaid : loan.principal, source: "msb" as const }] : []),
            { label: "Giá trị khi hoàn thành", value: goal.finalValue ?? goal.targetAmount, source: "msb", emphasis: true },
          ]}
        />
      </Section>

      <BottomActions>
        {balance > 0 ? (
          <>
            <button type="button" className={primaryButton} onClick={() => nav.push("WithdrawFlow", { goalId: goal.id })}>
              Rút tiền để sử dụng
            </button>
            <button type="button" className={secondaryButton} onClick={() => nav.push("TemplatePick")}>
              Tạo mục tiêu mới
            </button>
          </>
        ) : (
          <button type="button" className={primaryButton} onClick={() => nav.push("TemplatePick")}>
            Tạo mục tiêu mới
          </button>
        )}
        <button type="button" className={secondaryButton} onClick={() => nav.push("GoalList")}>
          Về danh sách
        </button>
      </BottomActions>
    </div>
  );
}
