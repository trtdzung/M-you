"use client";

import { useState } from "react";
import { PiggyBank, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/features/goals-preview/format-money";
import { getInvestProduct } from "../../../data/products";
import { cashBuffer, daysBetween, fundPriceAt, goalAccount, idleCash, investSuggestions, monthsLeft, addMonths, type InvestSuggestion } from "../../../engine";
import { RISK_LEVEL_LABEL } from "../../../model/labels";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { Amount, BottomActions, EmptyState, ScreenHeader, SourceTag } from "../../shared";
import { card, hint, infoBox, primaryButton, ring, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
import { dateVi, findGoal } from "../assets/helpers";

interface Projection {
  /** Indicative annual return, %. */
  returnPa: number;
  returnLabel: string;
  endDate: string;
  invested: number;
}

/** Expected end value: deposit/savings from rate, fund from trailing 12-month price move (indicative only). */
function project(s: InvestSuggestion, amount: number, today: string, targetDate: string, shiftPct: number): Projection {
  const product = getInvestProduct(s.productId);
  if (product?.kind === "fund") {
    const now = fundPriceAt(product, today, shiftPct);
    const past = fundPriceAt(product, addMonths(today, -12), 0);
    const r = past > 0 ? Math.max(-20, Math.min(30, ((now / past - 1) * 100))) : 0;
    const days = Math.max(0, daysBetween(today, targetDate));
    return { returnPa: r, returnLabel: `${(Math.round(r * 10) / 10).toString().replace(".", ",")}%/năm (theo 12 tháng gần nhất)`, endDate: targetDate, invested: Math.round(amount * (1 + (r / 100) * (days / 365))) };
  }
  const rate = s.ratePa ?? 0;
  const end = s.maturityDate ?? targetDate;
  const days = Math.max(0, daysBetween(today, end));
  return { returnPa: rate, returnLabel: `${String(rate).replace(".", ",")}%/năm`, endDate: end, invested: Math.round(amount * (1 + (rate / 100) * (days / 365))) };
}

/** Gợi ý đầu tư tiền nhàn rỗi trong tài khoản mục tiêu. */
export function InvestSuggest({ params }: ScreenProps) {
  const { state, nav } = usePreview();
  const goal = findGoal(state, paramString(params, "goalId"));
  const [selected, setSelected] = useState(0);

  if (!goal) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Gợi ý đầu tư" />
        <EmptyState title="Không tìm thấy mục tiêu" description="Hãy quay lại và chọn một mục tiêu." ctaLabel="Quay lại" onCta={() => nav.pop()} />
      </div>
    );
  }

  const today = state.clock.today;
  const idle = idleCash(state, goal);
  const account = goalAccount(state, goal);
  const buffer = cashBuffer(state, goal);
  const months = monthsLeft(today, goal.targetDate);
  const suggestions = investSuggestions(state, goal, idle).slice(0, 3);

  if (idle <= 0 || suggestions.length === 0) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Gợi ý đầu tư" subtitle={goal.name} />
        <EmptyState
          icon={<PiggyBank size={40} strokeWidth={1.5} />}
          title="Chưa có tiền nhàn rỗi"
          description={`Tiền trong tài khoản mục tiêu đang được giữ để trích các kỳ tới (khoảng ${formatVnd(buffer)}). Khi số dư cao hơn, MSB sẽ gợi ý cách sinh lời.`}
          ctaLabel="Quay lại"
          onCta={() => nav.pop()}
        />
      </div>
    );
  }

  const current = suggestions[Math.min(selected, suggestions.length - 1)];
  const amount = current.suggestedAmount;
  const proj = project(current, amount, today, goal.targetDate, state.market.fundPriceShiftPct);
  const holdRate = account?.interestRatePa ?? 0;
  const holdDays = Math.max(0, daysBetween(today, proj.endDate));
  const hold = Math.round(amount * (1 + (holdRate / 100) * (holdDays / 365)));

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Gợi ý đầu tư" subtitle={goal.name} />

      <section className={cn(card, "flex flex-col gap-2")}>
        <p className="text-[13px] text-muted">Tiền nhàn rỗi có thể đầu tư</p>
        <Amount amount={idle} source="msb" className="text-3xl font-bold" />
        <p className={hint}>
          Số dư tài khoản mục tiêu là {formatVnd(account?.balance ?? 0)}, trừ khoản cần giữ lại {formatVnd(buffer)} cho các kỳ tích luỹ sắp tới. Còn {months} tháng đến ngày mục tiêu ({dateVi(goal.targetDate)}).
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-label="Sản phẩm gợi ý">
        <h2 className={sectionTitle}>Phù hợp với thời gian còn lại</h2>
        {suggestions.map((s, i) => {
          const p = project(s, s.suggestedAmount, today, goal.targetDate, state.market.fundPriceShiftPct);
          const active = i === Math.min(selected, suggestions.length - 1);
          const Icon = getInvestProduct(s.productId)?.kind === "fund" ? TrendingUp : PiggyBank;
          return (
            <button
              key={`${s.productId}-${s.termMonths ?? 0}`}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(i)}
              className={cn("flex min-h-14 w-full flex-col gap-2 rounded-card border-2 bg-surface p-4 text-left shadow-card", ring, active ? "border-primary" : "border-transparent")}
            >
              <span className="flex items-center gap-2">
                <Icon size={20} className="text-primary-strong" aria-hidden />
                <span className="flex-1 text-[15px] font-semibold text-text">{s.title}</span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">{RISK_LEVEL_LABEL[s.riskLevel]}</span>
              </span>
              <span className="flex items-center gap-1.5 text-sm text-text">
                Lợi suất dự kiến: <b>{p.returnLabel}</b> <SourceTag source={s.estimatedAtMaturity ? "msb" : "estimated"} />
              </span>
              {s.maturityDate && <span className="text-[13px] text-muted">Đáo hạn {dateVi(s.maturityDate)}, trước ngày mục tiêu {dateVi(goal.targetDate)}</span>}
              <span className="text-[13px] leading-5 text-muted">
                <b className="text-text">Vì sao phù hợp:</b> {s.reason}
              </span>
              <span className="text-[13px] text-muted">Gợi ý đầu tư: {formatVnd(s.suggestedAmount)}</span>
              {s.caution && <span className="text-[12px] leading-4 text-muted">{s.caution}</span>}
            </button>
          );
        })}
      </section>

      <section className={cn(card, "flex flex-col gap-2")}>
        <h2 className={sectionTitle}>Giữ tiền hay đầu tư?</h2>
        <p className={hint}>
          Với {formatVnd(amount)}, tính đến {dateVi(proj.endDate)}:
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-surface-muted/70 p-3">
            <p className="text-[12px] text-muted">Giữ trong tài khoản ({String(holdRate).replace(".", ",")}%/năm)</p>
            <Amount amount={hold} source="estimated" className="mt-1 flex-wrap font-semibold" />
          </div>
          <div className="rounded-2xl bg-primary-soft p-3">
            <p className="text-[12px] text-primary-strong">Đầu tư {current.title}</p>
            <Amount amount={proj.invested} source="estimated" className="mt-1 flex-wrap font-semibold" />
          </div>
        </div>
        <p className="text-sm text-text">
          Chênh lệch dự kiến:{" "}
          <b className={proj.invested - hold >= 0 ? "text-positive" : "text-negative"}>
            {proj.invested - hold >= 0 ? "+" : ""}
            {formatVnd(proj.invested - hold)}
          </b>
        </p>
      </section>

      <p className={warningBox}>Lợi suất là dự kiến, không cam kết. Giá trị đầu tư có thể thay đổi, riêng quỹ có thể giảm giá.</p>
      <p className={infoBox}>Đầu tư xong, tiền chuyển từ tài khoản mục tiêu sang tài sản của cùng mục tiêu. Giá trị mục tiêu của bạn không đổi.</p>

      <BottomActions>
        <button
          type="button"
          className={primaryButton}
          onClick={() => nav.push("InvestConfirm", { goalId: goal.id, productId: current.productId, amount: current.suggestedAmount, termMonths: current.termMonths })}
        >
          Chọn {current.title}
        </button>
      </BottomActions>
    </div>
  );
}
