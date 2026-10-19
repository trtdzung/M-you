"use client";

import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { formatISODate, formatMonths } from "../../../engine/dates";
import type { ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import type { Goal } from "../../../model/types";
import { Amount } from "../../shared/Amount";
import { BottomActions } from "../../shared/BottomActions";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { SplitProgressBar } from "../../shared/SplitProgressBar";
import { StepProgress } from "../../shared/StepProgress";
import { card, ghostButton, infoBox, primaryButton, progressTrack, screenPadding, sectionTitle, warningBox } from "../../shared/styles";
import { DraftGuard, WIZARD_STEPS, evalDraft, wizardDeposit } from "./wizard";

/** Bước 4: kết quả kiểm tra khả thi. */
export function FeasibilityResult({ params }: ScreenProps) {
  return (
    <DraftGuard params={params} title="Kiểm tra kế hoạch">
      {(goal) => <Body goal={goal} deposit={wizardDeposit(params)} />}
    </DraftGuard>
  );
}

function Body({ goal, deposit }: { goal: Goal; deposit: number }) {
  const { state, nav } = usePreview();
  const plan = evalDraft(state, goal, deposit);
  const { feas, value, available } = plan;
  const ok = feas.status === "feasible" || feas.status === "tight" || feas.status === "reached";
  const unknown = feas.status === "unknown";
  const customer = state.customer;

  const verdict = ok
    ? {
        tone: "bg-positive-soft",
        icon: <CheckCircle2 size={28} className="text-positive" aria-hidden />,
        title: "Khả thi",
        text:
          feas.status === "reached"
            ? "Bạn đã có đủ giá trị cho mục tiêu này ngay từ bây giờ."
            : feas.status === "tight"
              ? "Làm được, nhưng sẽ chiếm phần lớn số dư hằng tháng. Hãy cân nhắc kỹ."
              : "Với số dư hằng tháng hiện tại, bạn đạt mục tiêu đúng hạn.",
      }
    : unknown
      ? {
          tone: "bg-surface-tint",
          icon: <HelpCircle size={28} className="text-muted" aria-hidden />,
          title: "Chưa đủ dữ liệu",
          text: "Chúng tôi chưa biết bạn dư được bao nhiêu mỗi tháng nên chưa thể kết luận.",
        }
      : {
          tone: "bg-warning-soft",
          icon: <AlertTriangle size={28} className="text-warning" aria-hidden />,
          title: "Cần điều chỉnh",
          text: "Với số dư hằng tháng hiện tại, bạn sẽ chưa đủ tiền vào ngày đạt mục tiêu.",
        };

  const projected = feas.projectedAtTarget === "unknown" ? null : feas.projectedAtTarget;
  const projPct = projected === null ? 0 : Math.min(100, (projected / goal.targetAmount) * 100);
  const nowPct = Math.min(100, (value.total / goal.targetAmount) * 100);

  const goOpen = () => nav.push("OpenAccountConfirm", { goalId: goal.id, deposit });
  const goOptions = () => nav.push("OptionsCompare", { goalId: goal.id, deposit });

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Kiểm tra kế hoạch" subtitle={goal.name} />
      <StepProgress steps={WIZARD_STEPS} current={3} />

      <section className={`rounded-card p-4 ${verdict.tone}`} aria-live="polite">
        <div className="flex items-center gap-3">
          {verdict.icon}
          <h2 className="text-[20px] font-bold text-text">{verdict.title}</h2>
        </div>
        <p className="mt-2 text-sm leading-5 text-text">{verdict.text}</p>
      </section>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className={sectionTitle}>Mục tiêu của bạn</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Cần có</dt>
            <dd className="font-semibold text-text">{formatVnd(goal.targetAmount)}</dd>
          </div>
          <div>
            <dt className="text-muted">Vào ngày</dt>
            <dd className="font-semibold text-text">
              {formatISODate(goal.targetDate)} <span className="font-normal text-muted">({formatMonths(feas.monthsLeft)})</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Đã có khi mở</dt>
            <dd>
              <Amount amount={value.total} source={value.assets > 0 && value.fixedCounted > 0 ? "self_reported" : "msb"} className="font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Cần tiết kiệm mỗi tháng</dt>
            <dd>
              <Amount amount={feas.requiredMonthly} source="estimated" className="font-semibold" />
            </dd>
          </div>
        </dl>
      </section>

      {unknown ? (
        <section className={`${card} flex flex-col gap-2`}>
          <h2 className={sectionTitle}>Còn thiếu gì?</h2>
          <ul className="list-disc pl-5 text-sm leading-6 text-text">
            <li>
              Ứng dụng mới có <strong>{customer.dataMonths} tháng</strong> dữ liệu giao dịch của bạn, chưa đủ để ước tính số dư hằng tháng.
            </li>
            <li>Sau khoảng 3 tháng sử dụng, kế hoạch sẽ được tính lại chính xác hơn.</li>
          </ul>
          <p className={warningBox}>
            Bạn vẫn có thể mở tài khoản và tự đặt mức tiết kiệm. Số liệu hiện tại là <strong>chưa rõ</strong>, không phải 0 đồng.
          </p>
        </section>
      ) : (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className={sectionTitle}>Số dư hằng tháng của bạn</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Dư mỗi tháng (ước tính)</dt>
              <dd>
                <Amount amount={customer.monthlySurplus} source="estimated" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Còn lại sau các mục tiêu ưu tiên hơn</dt>
              <dd>
                <Amount amount={available} source="estimated" className="font-semibold" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Mục tiêu này cần</dt>
              <dd>
                <Amount amount={feas.requiredMonthly} source="estimated" className="font-semibold" />
              </dd>
            </div>
          </dl>
          {typeof available === "number" && feas.requiredMonthly > available && (
            <p className={warningBox}>Thiếu {formatVnd(feas.requiredMonthly - available)} mỗi tháng so với phần bạn có thể dành ra.</p>
          )}
        </section>
      )}

      {!unknown && projected !== null && (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className={sectionTitle}>Dự kiến đến ngày {formatISODate(goal.targetDate)}</h2>
          <div className="flex flex-col gap-1.5">
            <div className={progressTrack} role="img" aria-label={`Dự kiến đạt ${Math.round(projPct)}% mục tiêu`}>
              <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${projPct}%` }} />
              <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${nowPct}%` }} />
            </div>
            <div className="flex justify-between text-[12px] text-muted">
              <span>Hiện có {formatVnd(value.total)}</span>
              <span>Mục tiêu {formatVnd(goal.targetAmount)}</span>
            </div>
          </div>
          <p className="text-sm text-text">
            Nếu mỗi tháng dành ra {formatVnd(typeof feas.allocatedMonthly === "number" ? feas.allocatedMonthly : 0)}, bạn sẽ có khoảng{" "}
            <strong>{formatVnd(projected)}</strong>
            {feas.gapAtTarget !== "unknown" && feas.gapAtTarget > 0 ? <>, còn thiếu <strong>{formatVnd(feas.gapAtTarget)}</strong>.</> : ", đủ cho mục tiêu."}
          </p>
        </section>
      )}

      {value.total > 0 && (
        <SplitProgressBar cash={value.cash} assets={value.assets} target={goal.targetAmount} showLegend />
      )}

      {!ok && !unknown && <p className={infoBox}>Đừng lo, có vài cách để điều chỉnh. Bạn sẽ thấy so sánh ở bước tiếp theo.</p>}

      <BottomActions>
        {ok || unknown ? (
          <button type="button" className={primaryButton} onClick={goOpen}>
            {unknown ? "Tiếp tục mở tài khoản" : "Mở tài khoản mục tiêu"}
          </button>
        ) : (
          <>
            <button type="button" className={primaryButton} onClick={goOptions}>
              Xem phương án
            </button>
            <button type="button" className={`${ghostButton} self-center`} onClick={goOpen}>
              Vẫn mở tài khoản với kế hoạch này
            </button>
          </>
        )}
      </BottomActions>
    </div>
  );
}
