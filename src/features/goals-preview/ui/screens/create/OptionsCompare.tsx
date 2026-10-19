"use client";

import { useState, type ReactNode } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { addMonths, formatISODate, formatMonths } from "../../../engine/dates";
import type { ScreenProps } from "../../../model/screens";
import type { Goal } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { Amount } from "../../shared/Amount";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SliderRow } from "../../shared/SliderRow";
import { StepProgress } from "../../shared/StepProgress";
import { errorBox, infoBox, screenPadding, secondaryButton, warningBox } from "../../shared/styles";
import { DraftGuard, WIZARD_STEPS, evalDraft, wizardDeposit } from "./wizard";

/** Bước 4 (tiếp): so sánh 4 phương án khi kế hoạch chưa khả thi. */
export function OptionsCompare({ params }: ScreenProps) {
  return (
    <DraftGuard params={params} title="Phương án điều chỉnh">
      {(goal) => <Body goal={goal} deposit={wizardDeposit(params)} />}
    </DraftGuard>
  );
}

function OptionCard({
  index,
  title,
  badge,
  children,
}: {
  index: number;
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
      <header className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-strong" aria-hidden>
          {index}
        </span>
        <h2 className="flex-1 !text-[16px] !leading-6 !font-bold text-text">{title}</h2>
        {badge && <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-text">{badge}</span>}
      </header>
      {children}
    </section>
  );
}

function Body({ goal, deposit }: { goal: Goal; deposit: number }) {
  const { state, dispatch, nav } = usePreview();
  const base = evalDraft(state, goal, deposit);
  const { options, feas, available, value } = base;
  const surplus = state.customer.monthlySurplus;

  // Extend
  const defaultExtra = options.extend?.extraMonths ?? 12;
  const [extra, setExtra] = useState(Math.min(120, defaultExtra));
  const extendPlan = evalDraft(state, goal, deposit, { targetDate: addMonths(goal.targetDate, extra) });

  // Reduce
  const step = goal.targetAmount >= 500_000_000 ? 5_000_000 : 1_000_000;
  const lower = Math.max(step, Math.ceil((value.total + step) / step) * step);
  const upper = Math.max(lower + step, Math.floor((goal.targetAmount - step) / step) * step);
  const defaultReduce = Math.min(upper, Math.max(lower, options.reduce ? Math.floor(options.reduce.newTargetAmount / step) * step : upper));
  const [reduced, setReduced] = useState(defaultReduce);
  const reducePlan = evalDraft(state, goal, deposit, { targetAmount: reduced });

  const fits = (p: typeof base) => p.feas.status === "feasible" || p.feas.status === "tight" || p.feas.status === "reached";

  const applyExtend = () => {
    dispatch({ type: "updateDraftGoal", goalId: goal.id, patch: { targetDate: addMonths(goal.targetDate, extra) } });
    nav.pop();
  };
  const applyReduce = () => {
    dispatch({ type: "updateDraftGoal", goalId: goal.id, patch: { targetAmount: reduced } });
    nav.pop();
  };

  const loan = options.loan;
  const saveMore = options.saveMore;
  const saveBlocked = saveMore?.fitsSurplus === false;

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Phương án điều chỉnh" subtitle={goal.name} />
      <StepProgress steps={WIZARD_STEPS} current={3} />
      <p className={infoBox}>
        Còn thiếu{" "}
        <strong>{feas.gapAtTarget === "unknown" ? formatVnd(Math.max(0, goal.targetAmount - value.total)) : formatVnd(feas.gapAtTarget)}</strong> vào ngày{" "}
        {formatISODate(goal.targetDate)}. Chọn một cách bên dưới, thử kéo thanh trượt để xem con số thay đổi.
      </p>

      {/* 1. Tiết kiệm thêm */}
      <OptionCard index={1} title="Tiết kiệm thêm mỗi tháng">
        {saveMore ? (
          <>
            <p className="text-sm text-text">
              Mỗi tháng cần dành <Amount amount={saveMore.monthly} source="estimated" className="font-bold" />.
            </p>
            <p className="text-[13px] leading-5 text-muted">
              Bạn đang có thể dành khoảng {available === "unknown" ? "chưa rõ" : formatVnd(available)}
              {saveMore.extraPerMonth > 0 ? `, tức là cần thêm ${formatVnd(saveMore.extraPerMonth)} mỗi tháng.` : "."}
            </p>
            {saveBlocked && (
              <p className={errorBox}>
                Số tiền này vượt tổng số dư hằng tháng của bạn ({surplus === "unknown" ? "chưa rõ" : formatVnd(surplus)}), nên khó thực hiện.
              </p>
            )}
            <button type="button" className={secondaryButton} disabled={saveBlocked} onClick={() => nav.push("OpenAccountConfirm", { goalId: goal.id, deposit })}>
              Chọn cách này
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Không cần thiết vào lúc này.</p>
        )}
      </OptionCard>

      {/* 2. Gia hạn */}
      <OptionCard index={2} title="Lùi ngày đạt mục tiêu">
        {options.extend ? (
          <>
            <SliderRow
              label="Lùi thêm"
              value={extra}
              min={1}
              max={Math.min(120, Math.max(36, defaultExtra + 24))}
              onChange={setExtra}
              format={(v) => formatMonths(v)}
              hint={`Ngày mới: ${formatISODate(addMonths(goal.targetDate, extra))}`}
            />
            <p className="text-sm text-text">
              Mỗi tháng cần <Amount amount={extendPlan.feas.requiredMonthly} source="estimated" className="font-bold" />
              {fits(extendPlan) ? <span className="text-positive"> · đủ sức</span> : <span className="text-warning"> · vẫn chưa đủ</span>}
            </p>
            <button type="button" className={secondaryButton} onClick={applyExtend}>
              Lùi đến {formatISODate(addMonths(goal.targetDate, extra))}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Chưa tính được vì bạn chưa có phần số dư dành cho mục tiêu này.</p>
        )}
      </OptionCard>

      {/* 3. Giảm mục tiêu */}
      <OptionCard index={3} title="Giảm số tiền mục tiêu">
        {options.reduce && upper > lower ? (
          <>
            <SliderRow
              label="Số tiền mới"
              value={reduced}
              min={lower}
              max={upper}
              step={step}
              onChange={setReduced}
              format={(v) => formatVnd(v)}
              hint={`Giảm ${formatVnd(goal.targetAmount - reduced)} so với ban đầu`}
            />
            <p className="text-sm text-text">
              Mỗi tháng cần <Amount amount={reducePlan.feas.requiredMonthly} source="estimated" className="font-bold" />
              {fits(reducePlan) ? <span className="text-positive"> · đủ sức</span> : <span className="text-warning"> · vẫn chưa đủ</span>}
            </p>
            <button type="button" className={secondaryButton} onClick={applyReduce}>
              Giảm xuống {formatVnd(reduced)}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Chưa tính được mức giảm phù hợp.</p>
        )}
      </OptionCard>

      {/* 4. Vay */}
      <OptionCard index={4} title="Vay phần còn thiếu" badge="Phương án cuối">
        {loan ? (
          <>
            <p className="text-[13px] leading-5 text-muted">Chỉ nên cân nhắc khi các cách trên chưa phù hợp. Vay làm tăng chi phí vì có lãi.</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Số tiền vay (ước tính)</dt>
                <dd className="font-semibold text-text">{formatVnd(loan.principal)}</dd>
              </div>
              <div>
                <dt className="text-muted">Trả mỗi tháng</dt>
                <dd className="font-semibold text-text">{formatVnd(loan.monthlyPayment)}</dd>
              </div>
              <div>
                <dt className="text-muted">Thời hạn · Lãi suất</dt>
                <dd className="font-semibold text-text">
                  {formatMonths(loan.termMonths)} · {loan.ratePa}%/năm
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tổng lãi</dt>
                <dd className="font-semibold text-text">{formatVnd(loan.totalInterest)}</dd>
              </div>
            </dl>
            {loan.affordability.allowed ? (
              <button type="button" className={secondaryButton} onClick={() => nav.push("LoanSimulator", { goalId: goal.id, amount: loan.principal, deposit })}>
                Thử tính khoản vay
              </button>
            ) : (
              <>
                <p className={warningBox}>
                  Khoản vay này làm tổng nghĩa vụ trả nợ lên {Math.round(loan.affordability.dti * 100)}% thu nhập, vượt mức an toàn 40%. Bạn có thể vay tối đa khoảng{" "}
                  {formatVnd(loan.affordability.maxPrincipal)}.
                </p>
                <button type="button" className={secondaryButton} onClick={() => nav.push("LoanBlocked", { goalId: goal.id, amount: loan.principal })}>
                  Xem chi tiết
                </button>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">Không cần vay vào lúc này.</p>
        )}
      </OptionCard>
    </div>
  );
}
