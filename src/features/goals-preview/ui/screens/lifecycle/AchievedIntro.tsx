"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { formatISODate, formatMonths } from "../../../engine";
import type { ScreenProps } from "../../../model/screens";
import { BottomActions, GoalStatusBadge, ScreenHeader, SummaryRows } from "../../shared";
import { card, infoBox, primaryButton, screenPadding } from "../../shared/styles";
import { NotFoundScreen, Section, useLoanScreen } from "../loan/shared";

/** Đạt mục tiêu khác Hoàn thành: giải thích giai đoạn 2 (tích luỹ & trả nợ). */
export function AchievedIntro({ params }: ScreenProps) {
  const { dispatch, goal, loan, nav } = useLoanScreen(params);
  if (!goal) return <NotFoundScreen title="Đạt mục tiêu" onCta={() => nav.push("GoalList")} />;

  const next = loan?.schedule.find((r) => r.status !== "paid");
  const go = () => {
    if (goal.status === "achieved") dispatch({ type: "startRepayment", goalId: goal.id });
    nav.replace("RepayOverview", { goalId: goal.id, loanId: loan?.id });
  };

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Đạt mục tiêu" subtitle={goal.name} />

      <section className="rounded-card bg-primary-soft p-4">
        <GoalStatusBadge status="achieved" />
        <p className="mt-2 text-[20px] font-bold leading-7 text-text">Bạn đã có “{goal.name}”</p>
        <p className="mt-1 text-sm leading-5 text-muted">
          Nhờ khoản vay {loan ? formatVnd(loan.principal) : ""} bổ sung phần còn thiếu, mục tiêu {formatVnd(goal.targetAmount)} đã đạt được ngay.
        </p>
      </section>

      <div className={infoBox}>
        <p className="font-semibold text-text">Đạt mục tiêu chưa phải Hoàn thành</p>
        <p className="mt-1 text-muted">
          Bạn đã có thứ mình cần, nhưng khoản vay vẫn đang chờ trả. Mục tiêu chỉ Hoàn thành khi bạn trả hết nợ.
        </p>
      </div>

      <Section title="Hai giai đoạn của mục tiêu">
        <ol className={`${card} flex flex-col gap-4`}>
          <li className="flex gap-3">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-positive" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold text-text">Giai đoạn 1: Tích luỹ</p>
              <p className="text-[13px] leading-5 text-muted">Bạn đã tiết kiệm và vay phần thiếu. Hoàn tất.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <Circle size={22} className="mt-0.5 shrink-0 text-primary-strong" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold text-text">Giai đoạn 2: Tích luỹ & trả nợ</p>
              <p className="text-[13px] leading-5 text-muted">
                Bạn tiếp tục nạp tiền vào tài khoản mục tiêu, MSB tự trừ tiền trả nợ mỗi kỳ. Trả hết nợ là Hoàn thành.
              </p>
            </div>
          </li>
        </ol>
      </Section>

      {loan && (
        <Section title="Khoản vay của bạn">
          <SummaryRows
            rows={[
              { label: "Số tiền vay", value: loan.principal, source: "msb", emphasis: true },
              { label: "Kỳ hạn", value: formatMonths(loan.termMonths) },
              { label: "Lãi suất", value: `${loan.ratePa}%/năm` },
              { label: "Trả mỗi tháng", value: loan.monthlyPayment, source: "msb" },
              { label: "Kỳ trả đầu tiên", value: next ? formatISODate(next.dueDate) : "—" },
            ]}
          />
        </Section>
      )}

      <BottomActions>
        <button type="button" className={primaryButton} onClick={go}>
          {goal.status === "achieved" ? "Bắt đầu giai đoạn trả nợ" : "Xem tiến độ trả nợ"}
        </button>
      </BottomActions>
    </div>
  );
}
