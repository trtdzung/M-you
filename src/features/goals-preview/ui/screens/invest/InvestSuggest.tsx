"use client";

import { useState } from "react";
import { PiggyBank, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatVnd, formatVndCompact } from "@/features/goals-preview/format-money";
import { getInvestProduct } from "../../../data/products";
import { cashBuffer, daysBetween, fundPriceAt, goalAccount, idleCash, investSuggestions, monthsLeft, addMonths, type InvestSuggestion } from "../../../engine";
import { RISK_LEVEL_LABEL } from "../../../model/labels";
import { paramString, type ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { BottomActions, EmptyState, ScreenHeader } from "../../shared";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { card, heroNumber, primaryButton, ring, screenPadding, sectionTitle } from "../../shared/styles";
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
    return { returnPa: r, returnLabel: `≈ ${(Math.round(r * 10) / 10).toString().replace(".", ",")}%/năm`, endDate: targetDate, invested: Math.round(amount * (1 + (r / 100) * (days / 365))) };
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

  const holdRate = account?.interestRatePa ?? 0;
  const view = suggestions.map((s) => {
    const p = project(s, s.suggestedAmount, today, goal.targetDate, state.market.fundPriceShiftPct);
    const hold = Math.round(s.suggestedAmount * (1 + (holdRate / 100) * (Math.max(0, daysBetween(today, p.endDate)) / 365)));
    const fund = getInvestProduct(s.productId)?.kind === "fund";
    const partial = s.suggestedAmount < idle;
    const tip = [
      s.reason,
      partial ? `Chỉ nên đưa một phần (${formatVnd(s.suggestedAmount)}) vào quỹ để hạn chế biến động.` : "",
      s.caution ?? "",
      `So với để trong tài khoản (${String(holdRate).replace(".", ",")}%/năm) đến ${dateVi(p.endDate)}: ${formatVnd(hold)} → ${formatVnd(p.invested)}.`,
    ].filter(Boolean).join(" ");
    return { s, p, gain: p.invested - hold, fund, tip };
  });
  const index = Math.min(selected, suggestions.length - 1);
  const current = suggestions[index];

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Gợi ý đầu tư" subtitle={goal.name} />

      <section className={cn(card, "flex flex-col gap-1")}>
        <div className="flex items-center gap-1">
          <p className="text-[13px] text-muted">Tiền nhàn rỗi có thể đầu tư</p>
          <InfoTooltip
            label="cách tính tiền nhàn rỗi"
            text={`Số dư tài khoản mục tiêu ${formatVnd(account?.balance ?? 0)}, giữ lại ${formatVnd(buffer)} cho các kỳ tích luỹ sắp tới. Còn ${months} tháng đến ngày mục tiêu (${dateVi(goal.targetDate)}).`}
          />
        </div>
        <p className={heroNumber}>{formatVndCompact(idle)}</p>
      </section>

      <section className="flex flex-col gap-3" aria-label="Chọn sản phẩm">
        <h2 className={sectionTitle}>Chọn một sản phẩm</h2>
        <div role="radiogroup" aria-label="Sản phẩm gợi ý" className="flex flex-col gap-3">
          {view.map(({ s, p, gain, fund, tip }, i) => {
            const active = i === index;
            const Icon = fund ? TrendingUp : PiggyBank;
            return (
              <section key={`${s.productId}-${s.termMonths ?? 0}`} className="relative">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-card border-2 bg-surface p-4 pr-12 text-left shadow-card transition-colors",
                    ring,
                    active ? "border-primary" : "border-transparent",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-border")}
                    >
                      {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                    </span>
                    <Icon size={18} className="shrink-0 text-primary-strong" aria-hidden />
                    <span className="text-[16px] font-semibold text-text">{s.title}</span>
                  </span>
                  <span className="pl-7 text-[13px] text-muted">
                    {p.returnLabel} · {s.maturityDate ? `đáo hạn ${dateVi(s.maturityDate).slice(3)}` : fund ? "giá thay đổi hằng ngày" : "rút được mọi lúc"} · {RISK_LEVEL_LABEL[s.riskLevel].toLowerCase()}
                  </span>
                  <span className="pl-7 text-sm text-text">Đầu tư {formatVndCompact(s.suggestedAmount)}</span>
                  <span className="pl-7 text-sm text-text">
                    Dự kiến{" "}
                    <b className={gain >= 0 ? "text-positive" : "text-negative"}>
                      {gain >= 0 ? "+" : ""}
                      {formatVndCompact(gain)}
                    </b>{" "}
                    sau {s.termMonths ?? monthsLeft(today, p.endDate)} tháng
                  </span>
                </button>
                <span className="absolute right-3 top-3">
                  <InfoTooltip label={`chi tiết ${s.title}`} text={tip} warning={fund} />
                </span>
              </section>
            );
          })}
        </div>
      </section>

      <section className="flex items-center gap-1 px-1" aria-label="Lưu ý">
        <p className="text-[13px] text-muted">Lợi suất là dự kiến, không cam kết.</p>
        <InfoTooltip
          label="lưu ý khi đầu tư"
          text="Giá trị đầu tư có thể thay đổi, riêng quỹ có thể giảm giá. Đầu tư xong, tiền chuyển từ tài khoản mục tiêu sang tài sản của cùng mục tiêu, giá trị mục tiêu không đổi."
        />
      </section>

      <BottomActions>
        <button
          type="button"
          className={primaryButton}
          onClick={() => nav.push("InvestConfirm", { goalId: goal.id, productId: current.productId, amount: current.suggestedAmount, termMonths: current.termMonths })}
        >
          Đầu tư {formatVndCompact(current.suggestedAmount)}
        </button>
      </BottomActions>
    </div>
  );
}
