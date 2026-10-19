"use client";

import { useState } from "react";
import { CalendarClock, Landmark, Target, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { addMonths, formatISODate, formatMonths, goalValue } from "../../../engine";
import { paramString, type ScreenProps } from "../../../model/screens";
import { BottomActions, ConfirmSheet, ScreenHeader, SliderRow } from "../../shared";
import { card, infoBox, primaryButton, ring, screenPadding, secondaryButton } from "../../shared/styles";
import { NotFoundScreen, loanGap, probeLoan, useLoanScreen } from "../loan/shared";

type Option = "extend" | "reduce" | "loan" | "close";

function OptionCard({
  selected,
  onSelect,
  icon,
  title,
  summary,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  summary: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn(card, "p-0 transition-colors", selected && "ring-2 ring-primary/50")}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn("flex min-h-14 w-full items-start gap-3 rounded-card p-4 text-left", ring)}
      >
        <span className="mt-0.5 shrink-0 text-primary-strong">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-text">{title}</span>
          <span className="block text-[13px] leading-5 text-muted">{summary}</span>
        </span>
      </button>
      {selected && children && <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>}
    </div>
  );
}

/** Chưa đạt mục tiêu: giọng điềm tĩnh, mỗi lựa chọn có số cụ thể, một nút chính cho lựa chọn đang chọn. */
export function MissedOptions({ params }: ScreenProps) {
  const { state, dispatch, goal, nav, today } = useLoanScreen(params);
  const focus = paramString(params, "focus");
  const [option, setOption] = useState<Option>(focus === "reduce" || focus === "loan" || focus === "close" ? focus : "extend");
  const [months, setMonths] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Option | null>(null);
  if (!goal) return <NotFoundScreen title="Chưa đạt mục tiêu" onCta={() => nav.push("GoalList")} />;

  const value = goalValue(state, goal);
  const gap = loanGap(state, goal);
  const probe = probeLoan(state, goal);

  // Extend: monthly saving estimated from the standing order, else the monthly surplus.
  const surplus = typeof state.customer.monthlySurplus === "number" ? state.customer.monthlySurplus : 0;
  const monthly = goal.standingOrder?.amount ?? surplus;
  const needMonths = monthly > 0 ? Math.ceil(gap / monthly) : null;
  const extMonths = months ?? Math.min(60, Math.max(1, needMonths ?? 6));
  const newDate = addMonths(today, extMonths);
  const projected = value.total + monthly * extMonths;
  const extendEnough = monthly > 0 && projected >= goal.targetAmount;

  const reduceTo = Math.floor(value.total / 1_000_000) * 1_000_000;
  const canReduce = reduceTo > 0 && reduceTo < goal.targetAmount;

  const back = () => nav.replace("GoalDetail", { goalId: goal.id });

  const primary: Record<Option, ReactNode> = {
    extend: (
      <button type="button" className={primaryButton} onClick={() => setConfirm("extend")}>
        Gia hạn đến {formatISODate(newDate)}
      </button>
    ),
    reduce: (
      <button type="button" className={primaryButton} disabled={!canReduce} onClick={() => setConfirm("reduce")}>
        Giảm mục tiêu xuống {formatVnd(reduceTo)}
      </button>
    ),
    loan: (
      <button type="button" className={primaryButton} onClick={() => nav.push(probe.possible ? "LoanSimulator" : "LoanBlocked", { goalId: goal.id })}>
        {probe.possible ? "Xem khoản vay mô phỏng" : "Xem vì sao chưa vay được"}
      </button>
    ),
    close: (
      <button type="button" className={secondaryButton} onClick={() => nav.push("CloseGoalFlow", { goalId: goal.id })}>
        Đóng mục tiêu
      </button>
    ),
  };

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Chưa đạt mục tiêu" subtitle={goal.name} />

      <div className={infoBox}>
        <p className="text-[17px] font-bold text-text">Còn thiếu {formatVnd(gap)}</p>
        <p className="mt-1 text-muted">
          Bạn đã có {formatVnd(value.total)} trên mục tiêu {formatVnd(goal.targetAmount)}. Đây không phải thất bại, chỉ là kế hoạch cần điều chỉnh. Chọn cách phù hợp nhất với bạn.
        </p>
      </div>

      <div role="radiogroup" aria-label="Các lựa chọn" className="flex flex-col gap-3">
        <OptionCard
          selected={option === "extend"}
          onSelect={() => setOption("extend")}
          icon={<CalendarClock size={22} aria-hidden />}
          title="Gia hạn thêm thời gian"
          summary={needMonths ? `Nếu giữ mức tích luỹ ${formatVnd(monthly)}/tháng, cần khoảng ${formatMonths(needMonths)}.` : "Chọn ngày mới để tiếp tục tích luỹ."}
        >
          <SliderRow label="Gia hạn thêm" value={extMonths} min={1} max={60} onChange={setMonths} format={formatMonths} />
          <p className="text-[13px] leading-5 text-muted">
            Hạn mới {formatISODate(newDate)}. {monthly > 0 ? (extendEnough ? `Dự kiến đủ tiền (ước tính ${formatVnd(projected)}).` : `Dự kiến có ${formatVnd(projected)}, vẫn chưa đủ, hãy kéo dài thêm.`) : "Chưa đủ dữ liệu để ước tính, bạn có thể tự chọn thời gian."}
          </p>
        </OptionCard>

        <OptionCard
          selected={option === "reduce"}
          onSelect={() => setOption("reduce")}
          icon={<Target size={22} aria-hidden />}
          title="Giảm số tiền mục tiêu"
          summary={canReduce ? `Hạ mục tiêu xuống ${formatVnd(reduceTo)}, đúng bằng số bạn đang có.` : "Số tiền hiện có quá nhỏ để hạ mục tiêu."}
        >
          {canReduce && (
            <p className="text-[13px] leading-5 text-muted">
              Mục tiêu sẽ hoàn thành ngay với số tiền mới. Số tiền gốc {formatVnd(goal.targetAmount)} vẫn được ghi lại.
            </p>
          )}
        </OptionCard>

        <OptionCard
          selected={option === "loan"}
          onSelect={() => setOption("loan")}
          icon={<Landmark size={22} aria-hidden />}
          title="Vay phần còn thiếu"
          summary={
            probe.possible
              ? `Vay ${formatVnd(probe.principal)} trong ${formatMonths(probe.termMonths)}, trả khoảng ${formatVnd(probe.quote.monthlyPayment)}/tháng (tham khảo).`
              : "Khoản trả sẽ vượt 40% thu nhập nên chưa thể vay phần thiếu này."
          }
        >
          <p className="text-[13px] leading-5 text-muted">Vay là phương án cuối cùng. Mục tiêu sẽ Đạt mục tiêu, rồi bước sang giai đoạn tích luỹ & trả nợ.</p>
        </OptionCard>

        <OptionCard
          selected={option === "close"}
          onSelect={() => setOption("close")}
          icon={<XCircle size={22} aria-hidden />}
          title="Đóng mục tiêu"
          summary={`Dừng mục tiêu này. Bạn rút được ${formatVnd(value.cash)} trong tài khoản mục tiêu.`}
        />
      </div>

      <BottomActions>{primary[option]}</BottomActions>

      <ConfirmSheet
        open={confirm === "extend"}
        title="Gia hạn mục tiêu"
        rows={[
          { label: "Hạn hiện tại", value: formatISODate(goal.targetDate) },
          { label: "Hạn mới", value: formatISODate(newDate), emphasis: true },
          { label: "Số tiền mục tiêu", value: goal.targetAmount },
        ]}
        confirmLabel="Gia hạn"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          dispatch({ type: "extend", goalId: goal.id, newTargetDate: newDate });
          back();
        }}
      />
      <ConfirmSheet
        open={confirm === "reduce"}
        title="Giảm mục tiêu"
        rows={[
          { label: "Mục tiêu hiện tại", value: goal.targetAmount },
          { label: "Mục tiêu mới", value: reduceTo, emphasis: true },
        ]}
        confirmLabel="Giảm mục tiêu"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          dispatch({ type: "reduceTarget", goalId: goal.id, newTargetAmount: reduceTo });
          nav.replace("GoalDetail", { goalId: goal.id });
        }}
      />
    </div>
  );
}

